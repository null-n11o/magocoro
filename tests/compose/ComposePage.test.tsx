import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";

function jpeg(): File {
  return new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" });
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
    expect(screen.getByText("写真は1〜3枚まで。1枚2MBまで")).toBeInTheDocument();
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

  it("rejects photos larger than 2MB without losing other inputs", async () => {
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
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText("写真が大きすぎます")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
    expect(screen.getByLabelText("署名")).toHaveValue("はると");
  });
});
