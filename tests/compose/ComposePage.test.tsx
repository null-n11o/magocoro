import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";

function jpeg(name = "a.jpg"): File {
  return new File([new Uint8Array(8)], name, { type: "image/jpeg" });
}

function renderCompose(api: LetterApi) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ComposePage api={api} />} />
        <Route path="/letter/:id" element={<p>手紙ページ</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ComposePage", () => {
  it("frames the form as a family album letter", () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);

    expect(
      screen.getByRole("heading", {
        name: "こんなことがあったよ",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("写真は1〜3枚まで。1枚10MBまで")).toBeInTheDocument();
    expect(screen.getByText("つながる、家族のアルバム")).toBeInTheDocument();
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
    expect(await screen.findByText("手紙ページ")).toBeInTheDocument();
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
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), files);
    await user.click(screen.getByRole("button", { name: "写真1を並べ替え" }));
    await user.keyboard("{ArrowRight}");
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
