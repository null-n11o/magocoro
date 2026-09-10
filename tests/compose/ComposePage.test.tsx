import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";

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
  it("frames composing as four stationery steps without an empty postmark", () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    const { container } = renderCompose(api);

    expect(
      screen.getByRole("heading", { name: "こんなことがあったよ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("写真といっしょに、ことばでつながる、Webのお手紙です。"))
      .toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "便箋のヘッダー" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "写真を飾る" })).toBeInTheDocument();
    expect(screen.getByText("写真は1〜3枚まで。1枚10MBまで")).toBeInTheDocument();

    expect(
      Array.from(container.querySelectorAll(".step-index"), (node) => node.textContent),
    ).toEqual(["1", "2", "3", "4"]);
    expect(container.querySelectorAll(".photo-slot")).toHaveLength(3);
    expect(container.querySelector(".compose-seal")).not.toBeInTheDocument();
  });

  it("keeps submit disabled without photo, body, or signature", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    const button = screen.getByRole("button", { name: "お手紙をつくる" });
    expect(button).toBeDisabled();
    expect(screen.getByText("孫の口調で書いてください")).toBeInTheDocument();
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

  it("rejects photos larger than 10MB without losing other inputs", async () => {
    const user = userEvent.setup();
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
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText("写真が大きすぎます")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
    expect(screen.getByLabelText("署名")).toHaveValue("はると");
  });

  it("accepts a photo up to 10MB", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(
      screen.getByLabelText("写真"),
      new File([new Uint8Array(10 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" }),
    );

    expect(screen.queryByText("写真が大きすぎます")).not.toBeInTheDocument();
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
      photos: [files[1]],
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
      photos: [files[1], files[2], files[0]],
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
      photos: [files[1], files[0]],
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
    });
  });
});
