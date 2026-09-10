import { describe, expect, it, vi } from "vitest";
import type { LetterPublic } from "../../src/api/types";
import { buildKeepVideo } from "../../src/letter/buildKeepVideo";
import type { PaperBundlePlan } from "../../src/media/bundleVideo";

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
  stamps: { read: 0, cute: 0 },
};

function paperWithClip(): { paper: HTMLElement; clip: HTMLVideoElement } {
  const paper = document.createElement("article");
  const clip = document.createElement("video");
  clip.className = "stamp-frame letter-clip";
  paper.append(clip);
  vi.spyOn(paper, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 360,
    height: 640,
    right: 360,
    bottom: 640,
    toJSON() {
      return {};
    },
  });
  vi.spyOn(clip, "getBoundingClientRect").mockReturnValue({
    x: 24,
    y: 32,
    left: 24,
    top: 32,
    width: 312,
    height: 180,
    right: 336,
    bottom: 212,
    toJSON() {
      return {};
    },
  });
  Object.defineProperty(clip, "duration", { configurable: true, get: () => 4 });
  return { paper, clip };
}

describe("buildKeepVideo", () => {
  it("keeps adjacent mixed photos in the static paper while animating only the clip", async () => {
    const { paper, clip } = paperWithClip();
    const photos = [document.createElement("img"), document.createElement("img")];
    paper.append(...photos);
    const canvas = document.createElement("canvas");
    const record = vi.fn(async (plan: PaperBundlePlan) => {
      expect(plan.paper).toBe(canvas);
      expect(plan.clip?.source).toBe(clip);
      expect(plan.durationMs).toBe(4000);
      expect(plan.clip?.useClipAudio).toBe(true);
      return new Blob(["video"], { type: "video/mp4" });
    });
    const file = await buildKeepVideo({ ...letter,
      media: { kind: "mixed", photoUrls: ["/p0", "/p1"], clipUrl: "/clip" },
    }, paper, { snapshot: async (element) => {
      expect(Array.from(element.querySelectorAll("img"))).toEqual(photos);
      return canvas;
    }, record, toJpeg: async () => new Blob(["image"], { type: "image/jpeg" }) });
    expect(record).toHaveBeenCalledTimes(1);
    expect(file.type).toBe("video/mp4");
  });
  it("returns a jpeg of the letter paper when there is no clip and no voice", async () => {
    const paper = document.createElement("article");
    const canvas = document.createElement("canvas");
    const snapshot = vi.fn(async () => canvas);
    const toJpeg = vi.fn(
      async () => new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
    );
    const record = vi.fn();
    const file = await buildKeepVideo(letter, paper, {
      snapshot,
      toJpeg,
      record,
    });
    expect(snapshot).toHaveBeenCalledWith(paper);
    expect(toJpeg).toHaveBeenCalledWith(canvas);
    expect(record).not.toHaveBeenCalled();
    expect(file.name).toBe("magocoro.jpg");
    expect(file.type).toMatch(/^image\/jpeg/);
  });

  it("records the paper with voice from the start instead of slicing photos", async () => {
    const paper = document.createElement("article");
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { value: 720 });
    Object.defineProperty(canvas, "height", { value: 1280 });
    const audio = new Blob([new Uint8Array(4)], { type: "audio/webm" });
    const record = vi.fn(async (plan: PaperBundlePlan) => {
      expect(plan.paper).toBe(canvas);
      expect(plan.durationMs).toBe(5000);
      expect(plan.audio).toBe(audio);
      expect(plan.clip).toBeUndefined();
      return new Blob([new Uint8Array(16)], { type: "video/webm" });
    });
    const file = await buildKeepVideo(
      { ...letter, audioUrl: "/api/letters/l_a/audio" },
      paper,
      {
        snapshot: async () => canvas,
        record,
        fetchBlob: async () => audio,
        measureDuration: async () => 5,
      },
    );
    expect(record).toHaveBeenCalledTimes(1);
    expect(file.name).toBe("magocoro.webm");
    expect(file.type).toMatch(/^video\//);
  });

  it("names an mp4 recording magocoro.mp4", async () => {
    const paper = document.createElement("article");
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { value: 720 });
    Object.defineProperty(canvas, "height", { value: 1280 });
    const file = await buildKeepVideo(
      { ...letter, audioUrl: "/api/letters/l_a/audio" },
      paper,
      {
        snapshot: async () => canvas,
        record: async () =>
          new Blob([new Uint8Array(16)], { type: "video/mp4" }),
        fetchBlob: async () => new Blob([new Uint8Array(4)], { type: "audio/mp4" }),
        measureDuration: async () => 3,
      },
    );
    expect(file.name).toBe("magocoro.mp4");
    expect(file.type).toBe("video/mp4");
  });

  it("plays the clip inside the paper instead of filling the frame", async () => {
    const { paper, clip } = paperWithClip();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { value: 360 });
    Object.defineProperty(canvas, "height", { value: 640 });
    const record = vi.fn(async (plan: PaperBundlePlan) => {
      expect(plan.clip?.source).toBe(clip);
      expect(plan.clip).toEqual(
        expect.objectContaining({
          x: 24,
          y: 32,
          width: 312,
          height: 180,
          mute: false,
          useClipAudio: true,
        }),
      );
      expect(plan.durationMs).toBe(4000);
      return new Blob([new Uint8Array(16)], { type: "video/webm" });
    });
    await buildKeepVideo(
      {
        ...letter,
        media: { kind: "clip", clipUrl: "/api/letters/l_a/clip" },
      },
      paper,
      { snapshot: async () => canvas, record },
    );
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("mutes the in-paper clip when parent voice is attached at start", async () => {
    const { paper, clip } = paperWithClip();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { value: 360 });
    Object.defineProperty(canvas, "height", { value: 640 });
    const audio = new Blob([new Uint8Array(4)], { type: "audio/webm" });
    const record = vi.fn(async (plan: PaperBundlePlan) => {
      expect(plan.clip?.source).toBe(clip);
      expect(plan.clip?.mute).toBe(true);
      expect(plan.clip?.useClipAudio).toBe(false);
      expect(plan.audio).toBe(audio);
      expect(plan.durationMs).toBe(9000);
      return new Blob([new Uint8Array(16)], { type: "video/webm" });
    });
    await buildKeepVideo(
      {
        ...letter,
        media: { kind: "clip", clipUrl: "/api/letters/l_a/clip" },
        audioUrl: "/api/letters/l_a/audio",
      },
      paper,
      {
        snapshot: async () => canvas,
        record,
        fetchBlob: async () => audio,
        measureDuration: async () => 9,
      },
    );
    expect(record).toHaveBeenCalledTimes(1);
  });
});
