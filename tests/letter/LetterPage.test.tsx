import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi, LetterPublic } from "../../src/api/types";
import { LetterPage } from "../../src/letter/LetterPage";

vi.mock("../../src/letter/buildKeepVideo", () => ({
  buildKeepVideo: vi.fn(
    async () =>
      new File([new Uint8Array(8)], "magocoro.webm", { type: "video/webm" }),
  ),
}));
vi.mock("../../src/media/shareBundle", () => ({
  shareOrSaveVideo: vi.fn().mockResolvedValue("shared"),
  downloadFile: vi.fn(),
}));

const letter: LetterPublic = {
  id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-12-07T12:00:00.000Z",
  addressTo: "じいじ、ばあばへ",
  body: "きょうね、たてたよ",
  signature: "はると",
  media: {
    kind: "photos",
    photoUrls: ["/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/photos/0"],
  },
  audioUrl: null,
  stamps: { read: 0, cute: 2 },
};

function apiWithLetter(overrides: Partial<LetterApi> = {}): LetterApi {
  return {
    createLetter: vi.fn(),
    getLetter: vi.fn().mockResolvedValue({ status: "ok", letter }),
    addStamp: vi.fn(),
    ...overrides,
  };
}

function renderLetter(
  api: LetterApi,
  id = letter.id,
  state?: { fromCompose?: boolean },
) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/letter/${id}`, state }]}
    >
      <Routes>
        <Route path="/letter/:id" element={<LetterPage api={api} />} />
        <Route path="/" element={<p>作る画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LetterPage", () => {
  it("presents the shared letter as a family photo letter", async () => {
    renderLetter(apiWithLetter());

    await screen.findByText("お孫さんからのお手紙です");
    expect(
      screen.queryByRole("heading", { name: "こんなことがあったよ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("お孫さんからのお手紙です")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "お手紙" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "手紙の写真" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "このお手紙に返事をする" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  });

  it("plays a clip and optional audio without autoplay", async () => {
    const clipLetter: LetterPublic = {
      ...letter,
      media: { kind: "clip", clipUrl: `/api/letters/${letter.id}/clip` },
      audioUrl: `/api/letters/${letter.id}/audio`,
    };
    renderLetter(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({ status: "ok", letter: clipLetter }),
      }),
    );
    const video = await screen.findByLabelText("手紙の動画");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", clipLetter.media.kind === "clip" ? clipLetter.media.clipUrl : "");
    expect(video).not.toHaveAttribute("autoPlay");
    const audio = screen.getByLabelText("手紙の声");
    expect(audio.tagName).toBe("AUDIO");
    expect(audio).toHaveAttribute("src", clipLetter.audioUrl);
    expect(audio).not.toHaveAttribute("autoPlay");
  });

  it("shows the copy note with the 90-day closing line", async () => {
    renderLetter(apiWithLetter());
    expect(
      await screen.findByText(
        "このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  });

  it("renders letter content and increments stamps", async () => {
    const user = userEvent.setup();
    const api = apiWithLetter({
      addStamp: vi.fn().mockResolvedValue({ status: "ok", stamps: { read: 1, cute: 2 } }),
    });
    renderLetter(api);
    expect(await screen.findByText("じいじ、ばあばへ")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/2026年9月8日/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "手紙の写真 1" })).toHaveAttribute(
      "src",
      letter.media.kind === "photos" ? letter.media.photoUrls[0] : "",
    );
    const read = screen.getByRole("button", { name: "読んだよ" });
    expect(read).toHaveAttribute("aria-pressed", "false");
    await user.click(read);
    expect(api.addStamp).toHaveBeenCalledWith(letter.id, "read");
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(read).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the Japan date for a JST morning postmark", async () => {
    renderLetter(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({
          status: "ok",
          letter: {
            ...letter,
            createdAt: "2026-09-07T15:30:00.000Z",
          },
        }),
      }),
    );
    expect(await screen.findByText("2026年9月8日")).toBeInTheDocument();
  });

  it("shows not found for unknown id", async () => {
    renderLetter(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({ status: "not_found" }),
      }),
      "l_dddddddddddddddddddddddddddddddd",
    );
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows not found when addStamp returns not_found", async () => {
    const user = userEvent.setup();
    const api = apiWithLetter({
      addStamp: vi.fn().mockResolvedValue({ status: "not_found" }),
    });
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "読んだよ" }));
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.queryByText("きょうね、たてたよ")).not.toBeInTheDocument();
  });

  it("keeps the letter visible when adding a stamp fails", async () => {
    const user = userEvent.setup();
    const api = apiWithLetter({
      addStamp: vi.fn().mockRejectedValue(new Error("unavailable")),
    });
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "読んだよ" }));
    expect(await screen.findByText("いま反応を送れません")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
  });

  it("shows not found when getLetter rejects", async () => {
    renderLetter(
      apiWithLetter({
        getLetter: vi.fn().mockRejectedValue(new Error("network")),
      }),
    );
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows a closed letter for expired id", async () => {
    renderLetter(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({ status: "expired" }),
      }),
    );
    expect(
      await screen.findByText("このお手紙は90日で閉じました"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByText("きょうね、たてたよ")).not.toBeInTheDocument();
  });

  it("shows the share UI after creating a letter", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderLetter(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    expect(
      screen.getByText("このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます"),
    ).toBeInTheDocument();
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
    renderLetter(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(
      await screen.findByText("コピーできませんでした。下のURLを長押ししてコピーしてください"),
    ).toBeInTheDocument();
    expect(screen.getByText(window.location.href)).toBeInTheDocument();
  });

  it("offers a keep-video share without removing URL copy", async () => {
    const user = userEvent.setup();
    renderLetter(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "動画にして送る" }));
    expect(await screen.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  });

  it("keeps URL copy when bundling fails", async () => {
    const user = userEvent.setup();
    const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
    vi.mocked(buildKeepVideo).mockRejectedValueOnce(new Error("fail"));
    renderLetter(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "動画にして送る" }));
    expect(
      await screen.findByText("動画にできませんでした。リンクを送ってください"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  });

  it("explains LINE upload when the file is saved locally", async () => {
    const user = userEvent.setup();
    const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
    vi.mocked(shareOrSaveVideo).mockResolvedValueOnce("saved");
    renderLetter(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "動画にして送る" }));
    expect(
      await screen.findByText("LINEのトークに、この動画を送ってください"),
    ).toBeInTheDocument();
  });
});
