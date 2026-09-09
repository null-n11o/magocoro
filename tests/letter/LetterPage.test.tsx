import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi, LetterPublic } from "../../src/api/types";
import { LetterPage } from "../../src/letter/LetterPage";

const letter: LetterPublic = {
  id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-08T12:00:00.000Z",
  addressTo: "じいじ、ばあばへ",
  body: "きょうね、たてたよ",
  signature: "はると",
  photoUrls: ["/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/photos/0"],
  stamps: { read: 0, cute: 2 },
};

function renderLetter(api: LetterApi, id = letter.id) {
  return render(
    <MemoryRouter initialEntries={[`/letter/${id}`]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterPage api={api} />} />
        <Route path="/" element={<p>作る画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LetterPage", () => {
  it("presents the shared letter as a family photo letter", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn(),
    };
    renderLetter(api);

    await screen.findByText("家族のアルバムに届きました");
    expect(
      screen.queryByRole("heading", { name: "こんなことがあったよ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("家族のアルバムに届きました")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "このお手紙に返事をする" })).toBeInTheDocument();
  });

  it("renders letter content and increments stamps", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn().mockResolvedValue({ read: 1, cute: 2 }),
    };
    renderLetter(api);
    expect(await screen.findByText("じいじ、ばあばへ")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/2026年9月8日/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "手紙の写真 1" })).toHaveAttribute(
      "src",
      letter.photoUrls[0],
    );
    expect(
      screen.getByText("このリンクをLINEに貼ると、相手のスマホでも開けます"),
    ).toBeInTheDocument();
    const read = screen.getByRole("button", { name: "読んだよ" });
    expect(read).toHaveAttribute("aria-pressed", "false");
    await user.click(read);
    expect(api.addStamp).toHaveBeenCalledWith(letter.id, "read");
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(read).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the Japan date for a JST morning postmark", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue({
        ...letter,
        createdAt: "2026-09-07T15:30:00.000Z",
      }),
      addStamp: vi.fn(),
    };
    renderLetter(api);
    expect(await screen.findByText("2026年9月8日")).toBeInTheDocument();
  });

  it("shows not found for unknown id", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(null),
      addStamp: vi.fn(),
    };
    renderLetter(api, "l_dddddddddddddddddddddddddddddddd");
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows not found when addStamp returns null", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn().mockResolvedValue(null),
    };
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "読んだよ" }));
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.queryByText("きょうね、たてたよ")).not.toBeInTheDocument();
  });

  it("keeps the letter visible when adding a stamp fails", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn().mockRejectedValue(new Error("unavailable")),
    };
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "読んだよ" }));
    expect(await screen.findByText("いま反応を送れません")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
  });

  it("shows not found when getLetter rejects", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockRejectedValue(new Error("network")),
      addStamp: vi.fn(),
    };
    renderLetter(api);
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("copies the current url", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn(),
    };
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText("コピーしました")).toBeInTheDocument();
  });

  it("shows a selectable URL when copying fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn(),
    };
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(
      await screen.findByText("コピーできませんでした。下のURLを長押ししてコピーしてください"),
    ).toBeInTheDocument();
    expect(screen.getByText(window.location.href)).toBeInTheDocument();
  });
});
