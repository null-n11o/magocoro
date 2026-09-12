import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";
import { prepareAudio } from "../../src/media/prepareAudio";
import { prepareClip } from "../../src/media/prepareClip";

vi.mock("../../src/media/compressImage", () => ({
  compressImage: async (file: File) => file,
}));
vi.mock("../../src/media/prepareClip", () => ({
  prepareClip: vi.fn(async (file: File) => ({ ok: true as const, file })),
  transcodeClipTo720p: vi.fn(async (file: File) => file),
}));
vi.mock("../../src/media/prepareAudio", () => ({
  prepareAudio: vi.fn(async (file: File) => ({ ok: true as const, file })),
}));
vi.mock("../../src/media/measureDuration", () => ({
  measureDuration: async () => 3,
}));

function jpeg(name = "a.jpg"): File {
  return new File([new Uint8Array(8)], name, { type: "image/jpeg" });
}

function LetterDestination() {
  const [searchParams] = useSearchParams();
  return <p>手紙ページ{searchParams.get("sender") === "1" ? " 送り側" : " 受け手"}</p>;
}

function renderCompose(api: LetterApi) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ComposePage api={api} />} />
        <Route path="/letter/:id" element={<LetterDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ComposePage", () => {
  it("shows an editorial composer and an empty live preview", () => {
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    expect(screen.getByRole("heading", { name: /なんでもない今日を/ })).toBeInTheDocument();
    expect(screen.getByLabelText("お手紙のプレビュー")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("");
  });

  it("shows the brand logo in the header", () => {
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    const home = screen.getByRole("link", { name: "Magocoro" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("img.brand-logo")).toBeInTheDocument();
  });

  it("keeps submit disabled without media, body, or signature", async () => {
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    expect(screen.getByRole("button", { name: "お手紙をつくる" })).toBeDisabled();
    expect(screen.getByText("写真か動画をえらんでください")).toBeInTheDocument();
  });

  it("retains photos and sends the exact mixed request", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    expect(screen.getByRole("img", { name: "選んだ写真 1" })).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        media: { kind: "mixed", photos: [expect.any(File)], clip: expect.any(File) },
      }),
    );
  });

  it("rejects a clip over 30 seconds without clearing the body", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(prepareClip).mockResolvedValueOnce({ ok: false, reason: "too_long" });
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    expect(await screen.findByText("30秒以内にしてください")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
  });

  it("locks media and creation while preparing, retaining a valid clip on replacement failure", async () => {
    const user = userEvent.setup();
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    const clip = new File(["clip"], "a.mp4", { type: "video/mp4" });
    await user.upload(screen.getByLabelText("動画"), clip);
    await user.type(screen.getByLabelText("本文"), "漢字もそのまま\nだよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    let finish!: (value: {ok:false;reason:"too_long"}) => void;
    vi.mocked(prepareClip).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await user.upload(screen.getByLabelText("動画"), clip);
    expect(screen.getByRole("button", {name:"お手紙をつくる"})).toBeDisabled();
    expect(screen.getByLabelText("写真")).toBeDisabled();
    await act(async () => finish({ok:false,reason:"too_long"}));
    expect(await screen.findByLabelText("手紙の動画")).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"お手紙をつくる"})).toBeEnabled();
  });

  it.each([true, false])("caps combined media in either order and removal restores capacity (%s)", async (clipFirst) => {
    const user = userEvent.setup();
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    const clip = new File(["clip"], "a.mp4", { type: "video/mp4" });
    if (clipFirst) await user.upload(screen.getByLabelText("動画"), clip);
    await user.upload(screen.getByLabelText("写真"), [jpeg("a.jpg"),jpeg("b.jpg"),jpeg("c.jpg")]);
    if (!clipFirst) await user.upload(screen.getByLabelText("動画"), clip);
    expect(screen.getByText("写真と動画はあわせて3つまでです")).toBeInTheDocument();
    expect(screen.getAllByAltText(/選んだ写真/)).toHaveLength(clipFirst ? 2 : 3);
    await user.click(screen.getByRole("button", {name:"写真1を削除"}));
    if (clipFirst) await user.upload(screen.getByLabelText("写真"), jpeg("d.jpg"));
    else await user.upload(screen.getByLabelText("動画"), clip);
    expect(await screen.findByLabelText("手紙の動画")).toBeInTheDocument();
    expect(screen.getAllByAltText(/選んだ写真/)).toHaveLength(2);
  });

  it("creates a photo letter without audio", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalledWith({
      media: { kind: "photos", photos: [expect.any(File)] },
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
    });
  });

  it("attaches prepared audio when a voice file is chosen", async () => {
    const user = userEvent.setup();
    const voice = new File([new Uint8Array(8)], "a.webm", { type: "audio/webm" });
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.upload(screen.getByLabelText("声"), voice);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(File) }),
    );
  });

  it("keeps other fields when recording is denied", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.click(screen.getByRole("button", { name: "録音する" }));
    expect(await screen.findByText("録音できません")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
    expect(screen.getByRole("link", { name: "SafariまたはChromeで開く" })).toHaveAttribute(
      "href",
      `${window.location.origin}/compose?openExternalBrowser=1`,
    );
    expect(screen.getByText(/新しいブラウザでは、選んだ素材と入力内容をもう一度入れてください/)).toBeInTheDocument();
  });

  it("offers external-browser recovery for an unsupported video and retains the draft", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(prepareClip).mockResolvedValueOnce({ ok: false, reason: "unsupported" });
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "公園で遊んだよ");
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    expect(await screen.findByText("この動画は使えません")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "選んだ写真 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("公園で遊んだよ");
    expect(screen.getByRole("link", { name: "SafariまたはChromeで開く" })).toBeInTheDocument();
  });

  it("offers external-browser recovery for an unsupported audio and retains the draft", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(prepareAudio).mockResolvedValueOnce({ ok: false, reason: "unsupported" });
    renderCompose({ createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() });
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "声も届けたいよ");
    await user.upload(
      screen.getByLabelText("声"),
      new File([new Uint8Array(8)], "a.webm", { type: "audio/webm" }),
    );
    expect(await screen.findByText("この音声は使えません")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "選んだ写真 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("声も届けたいよ");
    expect(screen.getByRole("link", { name: "SafariまたはChromeで開く" })).toBeInTheDocument();
  });

  it("ignores a second record tap while getUserMedia is in flight", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>(() => {
          /* hang until the test ends */
        }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    await user.click(screen.getByRole("button", { name: "録音する" }));
    await user.click(screen.getByRole("button", { name: "録音する" }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("navigates after a successful create", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    const fileInput = screen.getByLabelText("写真");
    await user.upload(fileInput, jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalled();
    expect(await screen.findByText("手紙ページ 送り側")).toBeInTheDocument();
  });

  it("keeps input and shows error when save fails", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockRejectedValue(new Error("nope")),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(await screen.findByText("いま保存できません")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
  });

  it("shows a busy label while the letter is being created", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: { id: string }) => void;
    const createLetter = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const api: LetterApi = {
      createLetter,
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);

    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));

    const busyButton = screen.getByRole("button", {
      name: "お手紙をつくっています…",
    });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    expect(createLetter).toHaveBeenCalledTimes(1);

    resolveCreate({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(await screen.findByText("手紙ページ 送り側")).toBeInTheDocument();
  });

  it("rejects unsupported photo types without losing other inputs", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.upload(
      screen.getByLabelText("写真"),
      new File(["text"], "a.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("この写真は使えません")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
    expect(screen.getByLabelText("署名")).toHaveValue("はると");
  });

  it("deletes a selected photo before saving", async () => {
    const user = userEvent.setup();
    const files = [jpeg("a.jpg"), jpeg("b.jpg")];
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), files);
    await user.click(screen.getByRole("button", { name: "写真1を削除" }));
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));

    expect(api.createLetter).toHaveBeenCalledWith({
      media: { kind: "photos", photos: [files[1]] },
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
    });
  });

  it("reorders selected photos with a touch drag before saving", async () => {
    const user = userEvent.setup();
    const files = [jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg")];
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), files);

    const handle = screen.getByRole("button", { name: "写真1を並べ替え" });
    const thirdCard = screen
      .getByRole("button", { name: "写真3を削除" })
      .closest("[data-photo-index]");
    expect(thirdCard).not.toBeNull();
    const originalElementFromPoint = (
      document as Document & {
        elementFromPoint?: (x: number, y: number) => Element | null;
      }
    ).elementFromPoint;
    const elementFromPoint = vi.fn().mockReturnValue(thirdCard as HTMLElement);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 10, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(handle, { clientX: 10, clientY: 10, pointerId: 1, pointerType: "touch" });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });

    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));

    expect(api.createLetter).toHaveBeenCalledWith({
      media: { kind: "photos", photos: [files[1], files[2], files[0]] },
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
    });
  });

  it("reorders selected photos with the arrow keys", async () => {
    const user = userEvent.setup();
    const files = [jpeg("a.jpg"), jpeg("b.jpg")];
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    const { container } = renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), files);
    const placingCards = Array.from(container.querySelectorAll(".photo-card.is-placing"));
    expect(placingCards).toHaveLength(2);
    for (const card of placingCards) {
      fireEvent.animationEnd(card, { animationName: "photo-place" });
    }
    screen.getByRole("button", { name: "写真1を並べ替え" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "写真2を並べ替え" })).toHaveFocus();
    expect(container.querySelectorAll(".photo-card.is-placing")).toHaveLength(0);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));

    expect(api.createLetter).toHaveBeenCalledWith({
      media: { kind: "photos", photos: [files[1], files[0]] },
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
    });
  });
});
