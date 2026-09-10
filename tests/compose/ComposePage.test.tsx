import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";
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
  const location = useLocation();
  const state = location.state as { fromCompose?: boolean } | null;
  return <p>手紙ページ{state?.fromCompose ? " 送り側" : " 受け手"}</p>;
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
  it("frames composing as stationery steps without grandchild-tone coaching", () => {
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    const { container } = renderCompose(api);
    expect(screen.getByRole("heading", { name: "こんなことがあったよ" })).toBeInTheDocument();
    expect(
      screen.getByText("写真または短い動画と、ことばと声を1通にまとめる、Webのお手紙です。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("孫の口調で書いてください")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("今週のできごとを、短くでよいので書いてください")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "写真" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "動画" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".compose-seal")).not.toBeInTheDocument();
  });

  it("keeps submit disabled without media, body, or signature", async () => {
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    expect(screen.getByRole("button", { name: "お手紙をつくる" })).toBeDisabled();
    expect(screen.getByText("写真を1枚以上えらんでください")).toBeInTheDocument();
  });

  it("clears photos when switching to video", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.click(screen.getByRole("button", { name: "動画" }));
    expect(screen.queryByRole("img", { name: "選んだ写真 1" })).not.toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({ kind: "clip" }),
      }),
    );
  });

  it("rejects a clip over 30 seconds without clearing the body", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(prepareClip).mockResolvedValueOnce({ ok: false, reason: "too_long" });
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.click(screen.getByRole("button", { name: "動画" }));
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    expect(await screen.findByText("30秒以内にしてください")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
  });

  it("ignores a late clip failure after switching to photos", async () => {
    const user = userEvent.setup();
    let finishPrepare!: (result: { ok: false; reason: "too_long" }) => void;
    vi.mocked(prepareClip).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrepare = resolve;
        }),
    );
    const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
    renderCompose(api);
    await user.click(screen.getByRole("button", { name: "動画" }));
    await user.upload(
      screen.getByLabelText("動画"),
      new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
    );
    await user.click(screen.getByRole("button", { name: "写真" }));
    await act(async () => {
      finishPrepare({ ok: false, reason: "too_long" });
    });
    expect(screen.getByRole("button", { name: "写真" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("30秒以内にしてください")).not.toBeInTheDocument();
    expect(screen.queryByText("この動画は使えません")).not.toBeInTheDocument();
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
