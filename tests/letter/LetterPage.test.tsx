import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi, LetterPublic } from "../../src/api/types";
import { LetterPage } from "../../src/letter/LetterPage";

vi.mock("../../src/letter/buildKeepVideo", () => ({
  buildKeepVideo: vi.fn(
    async () =>
      new File([new Uint8Array(8)], "magocoro.jpg", { type: "image/jpeg" }),
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

function renderLetter(api: LetterApi, id = letter.id, search = "", hash = "") {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/letter/${id}`, search, hash }]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterPage api={api} />} />
        <Route path="/compose" element={<p>作る画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSender(api: LetterApi, id = letter.id, search = "?sender=1", hash = "") {
  return renderLetter(api, id, search, hash);
}

describe("LetterPage", () => {
  it("renders mixed media and preserves the original body in the exported paper", async () => {
    const mixed: LetterPublic = {...letter, body:"今日は公園へ。\nたのしかった！", media:{kind:"mixed",clipUrl:"/clip",photoUrls:["/one","/two"]}};
    renderSender(apiWithLetter({getLetter:vi.fn().mockResolvedValue({status:"ok",letter:mixed})}));
    await screen.findByLabelText("手紙の動画");
    expect(screen.getAllByAltText(/手紙の写真/)).toHaveLength(2);
    const paper = screen.getByRole("article", {name:"お手紙"});
    expect(paper.querySelector(".letter-body")?.textContent).toBe(mixed.body);
    await userEvent.click(screen.getByRole("button", {name:"動画にして送る"}));
    const {buildKeepVideo} = await import("../../src/letter/buildKeepVideo");
    expect(buildKeepVideo).toHaveBeenCalledWith(mixed,paper);
  });

  it("presents the shared letter as a family photo letter", async () => {
    renderSender(apiWithLetter());

    await screen.findByText("お孫さんからのお手紙です");
    expect(screen.getByRole("img", { name: "Magocoro" })).toBeInTheDocument();
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
    renderSender(apiWithLetter());
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
    renderSender(api);
    expect(await screen.findByText("じいじ、ばあばへ")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/2026年9月8日/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "手紙の写真 1" })).toHaveAttribute(
      "src",
      letter.media.kind === "photos" ? letter.media.photoUrls[0] : "",
    );
    const read = screen.getByRole("button", { name: "よんだよ" });
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
      "/compose",
    );
  });

  it("shows not found when addStamp returns not_found", async () => {
    const user = userEvent.setup();
    const api = apiWithLetter({
      addStamp: vi.fn().mockResolvedValue({ status: "not_found" }),
    });
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "よんだよ" }));
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
    await user.click(screen.getByRole("button", { name: "よんだよ" }));
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
      "/compose",
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
      "/compose",
    );
    expect(screen.getByRole("img", { name: "Magocoro" })).toBeInTheDocument();
    expect(screen.queryByText("きょうね、たてたよ")).not.toBeInTheDocument();
  });

  it("offers LINE sharing to senders with only the canonical letter URL", async () => {
    renderSender(apiWithLetter(), letter.id, "?sender=1&campaign=family", "#draft");
    expect(await screen.findByRole("link", { name: "LINEで送る" })).toHaveAttribute(
      "href",
      `https://line.me/R/share?text=${encodeURIComponent(`${window.location.origin}/letter/${letter.id}`)}`,
    );
  });

  it("hides the share UI from recipients but keeps the reply UI", async () => {
    renderLetter(apiWithLetter());
    await screen.findByText("お孫さんからのお手紙です");
    expect(screen.queryByRole("button", { name: "リンクをコピー" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "画像にして送る" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "動画にして送る" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "LINEで送る" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "よんだよ" })).toBeInTheDocument();
  });

  it("shows the share UI after creating a letter", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    expect(
      screen.getByText("このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/letter/${letter.id}`,
    );
    expect(await screen.findByText("コピーしました")).toBeInTheDocument();
  });

  it("shows a selectable URL when copying fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(
      await screen.findByText("コピーできませんでした。下のURLを長押ししてコピーしてください"),
    ).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/letter/${letter.id}`)).toBeInTheDocument();
  });

  it("offers an image share for a photo letter without voice", async () => {
    const user = userEvent.setup();
    const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    const paper = screen.getByRole("article", { name: "お手紙" });
    await user.click(screen.getByRole("button", { name: "画像にして送る" }));
    expect(buildKeepVideo).toHaveBeenCalledWith(letter, paper);
    expect(await screen.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "動画にして送る" })).not.toBeInTheDocument();
  });

  it("offers a keep-video share when the letter has a clip or voice", async () => {
    const clipLetter: LetterPublic = {
      ...letter,
      media: { kind: "clip", clipUrl: `/api/letters/${letter.id}/clip` },
    };
    renderSender(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({ status: "ok", letter: clipLetter }),
      }),
    );
    await screen.findByText("じいじ、ばあばへ");
    expect(screen.getByRole("button", { name: "動画にして送る" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "画像にして送る" })).not.toBeInTheDocument();
  });

  it("keeps URL copy when bundling fails", async () => {
    const user = userEvent.setup();
    const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
    vi.mocked(buildKeepVideo).mockRejectedValueOnce(new Error("fail"));
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "画像にして送る" }));
    expect(
      await screen.findByText("画像にできませんでした。リンクを送ってください"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  });

  it("waits for a fresh tap after generation and reuses the file for sharing", async () => {
    const user = userEvent.setup();
    const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
    const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
    vi.mocked(buildKeepVideo).mockClear();
    vi.mocked(shareOrSaveVideo).mockClear();
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "画像にして送る" }));
    expect(shareOrSaveVideo).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "画像を共有・保存する" }));
    expect(shareOrSaveVideo).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "画像を共有・保存する" }));
    expect(buildKeepVideo).toHaveBeenCalledTimes(1);
    expect(shareOrSaveVideo).toHaveBeenCalledTimes(2);
  });

  it("keeps the prepared file available when sharing fails", async () => {
    const user = userEvent.setup();
    const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
    vi.mocked(shareOrSaveVideo).mockRejectedValueOnce(new Error("denied"));
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "画像にして送る" }));
    await user.click(await screen.findByRole("button", { name: "画像を共有・保存する" }));
    expect(await screen.findByText(/共有できませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画像を共有・保存する" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeEnabled();
  });

  it("explains LINE upload when the file is saved locally", async () => {
    const user = userEvent.setup();
    const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
    vi.mocked(shareOrSaveVideo).mockResolvedValueOnce("saved");
    renderSender(apiWithLetter());
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "画像にして送る" }));
    await user.click(await screen.findByRole("button", { name: "画像を共有・保存する" }));
    expect(
      await screen.findByText("LINEのトークに、この画像を送ってください"),
    ).toBeInTheDocument();
  });

  it("keeps the video wording when a clip letter is saved locally", async () => {
    const user = userEvent.setup();
    const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
    const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
    vi.mocked(buildKeepVideo).mockResolvedValueOnce(
      new File([new Uint8Array(8)], "magocoro.webm", { type: "video/webm" }),
    );
    vi.mocked(shareOrSaveVideo).mockResolvedValueOnce("saved");
    const clipLetter: LetterPublic = {
      ...letter,
      media: { kind: "clip", clipUrl: `/api/letters/${letter.id}/clip` },
    };
    renderSender(
      apiWithLetter({
        getLetter: vi.fn().mockResolvedValue({ status: "ok", letter: clipLetter }),
      }),
    );
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "動画にして送る" }));
    await user.click(await screen.findByRole("button", { name: "動画を共有・保存する" }));
    expect(
      await screen.findByText("LINEのトークに、この動画を送ってください"),
    ).toBeInTheDocument();
  });
});
