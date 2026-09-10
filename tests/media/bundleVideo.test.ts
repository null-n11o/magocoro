import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addParentAudioTrack,
  drawClipCover,
  clipInPaperPlan,
  keepRecorderMime,
  keepShareKind,
  keepVideoFile,
  letterBundleDurationMs,
  mediaRectInPaper,
  renderPaperBundle,
  snapshotToJpeg,
} from "../../src/media/bundleVideo";

describe("keepShareKind", () => {
  it("uses video for mixed media without voice", () => {
    expect(keepShareKind({ media: { kind: "mixed" }, audioUrl: null })).toBe("video");
  });
  it("uses an image when the letter has photos and no voice", () => {
    expect(
      keepShareKind({
        media: { kind: "photos", photoUrls: ["/p"] },
        audioUrl: null,
      }),
    ).toBe("image");
  });

  it("uses a video when the letter has voice or a clip", () => {
    expect(
      keepShareKind({
        media: { kind: "photos", photoUrls: ["/p"] },
        audioUrl: "/audio",
      }),
    ).toBe("video");
    expect(
      keepShareKind({
        media: { kind: "clip", clipUrl: "/clip" },
        audioUrl: null,
      }),
    ).toBe("video");
  });
});

describe("letterBundleDurationMs", () => {
  it("follows audio length when there is no clip", () => {
    expect(
      letterBundleDurationMs({ audioDurationSec: 8, clipDurationSec: null }),
    ).toBe(8000);
  });

  it("uses the longer of clip and voice", () => {
    expect(
      letterBundleDurationMs({ audioDurationSec: 10, clipDurationSec: 4 }),
    ).toBe(10000);
    expect(
      letterBundleDurationMs({ audioDurationSec: 3, clipDurationSec: 9 }),
    ).toBe(9000);
  });

  it("follows clip length when there is no voice", () => {
    expect(
      letterBundleDurationMs({ audioDurationSec: null, clipDurationSec: 6 }),
    ).toBe(6000);
  });
});

describe("clipInPaperPlan", () => {
  it("mutes the clip only when parent audio exists", () => {
    expect(clipInPaperPlan(true)).toEqual({
      muteClip: true,
      useParentAudio: true,
    });
    expect(clipInPaperPlan(false)).toEqual({
      muteClip: false,
      useParentAudio: false,
    });
  });
});

describe("keepRecorderMime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers mp4 over webm when the recorder supports both", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (type: string) =>
        type.startsWith("video/mp4") || type.startsWith("video/webm"),
    });
    expect(keepRecorderMime()).toMatch(/^video\/mp4/);
  });

  it("falls back to webm when mp4 is unavailable", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (type: string) => type.startsWith("video/webm"),
    });
    expect(keepRecorderMime()).toMatch(/^video\/webm/);
  });
});

describe("keepVideoFile", () => {
  it("names an mp4 blob magocoro.mp4", () => {
    const file = keepVideoFile(
      new Blob([new Uint8Array(8)], { type: "video/mp4;codecs=avc1" }),
    );
    expect(file.name).toBe("magocoro.mp4");
    expect(file.type).toBe("video/mp4");
  });

  it("names a webm blob magocoro.webm", () => {
    const file = keepVideoFile(
      new Blob([new Uint8Array(8)], { type: "video/webm;codecs=vp8" }),
    );
    expect(file.name).toBe("magocoro.webm");
    expect(file.type).toMatch(/^video\/webm/);
  });
});

describe("mediaRectInPaper", () => {
  it("returns the media box relative to the paper", () => {
    const paper = document.createElement("article");
    const media = document.createElement("video");
    paper.append(media);
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      toJSON() {
        return {};
      },
    });
    vi.spyOn(media, "getBoundingClientRect").mockReturnValue({
      x: 30,
      y: 50,
      left: 30,
      top: 50,
      width: 100,
      height: 80,
      right: 130,
      bottom: 130,
      toJSON() {
        return {};
      },
    });
    expect(mediaRectInPaper(paper, media)).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 80,
    });
  });
});

describe("renderPaperBundle", () => {
  it("records one paper snapshot instead of photo frames", async () => {
    const paper = {} as CanvasImageSource;
    const record = vi.fn(async (plan) => {
      expect("frames" in plan).toBe(false);
      expect(plan.paper).toBe(paper);
      expect(plan.durationMs).toBe(4000);
      expect(plan.clip).toBeUndefined();
      return new Blob([new Uint8Array(16)], { type: "video/webm" });
    });
    const blob = await renderPaperBundle({
      plan: {
        paper,
        width: 720,
        height: 1280,
        durationMs: 4000,
        audio: new Blob([new Uint8Array(4)], { type: "audio/webm" }),
      },
      record,
    });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toMatch(/^video\//);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("places the clip inside the paper instead of filling the frame", async () => {
    const record = vi.fn(async (plan) => {
      expect(plan.clip).toEqual(
        expect.objectContaining({ x: 20, y: 30, width: 100, height: 80 }),
      );
      return new Blob([new Uint8Array(8)], { type: "video/webm" });
    });
    await renderPaperBundle({
      plan: {
        paper: {} as CanvasImageSource,
        width: 360,
        height: 640,
        durationMs: 1000,
        clip: {
          source: {} as CanvasImageSource,
          x: 20,
          y: 30,
          width: 100,
          height: 80,
          mute: false,
          useClipAudio: true,
        },
      },
      record,
    });
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("snapshotToJpeg", () => {
  it("returns a jpeg blob from a paper snapshot", async () => {
    const jpeg = await snapshotToJpeg({} as HTMLCanvasElement, async () =>
      new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
    );
    expect(jpeg.size).toBeGreaterThan(0);
    expect(jpeg.type).toMatch(/^image\/jpeg/);
  });
});

describe("addParentAudioTrack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubAudio(options: {
    captureStream?: () => MediaStream | undefined;
    play?: () => Promise<void>;
  }) {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio");
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      elementOptions?: string | ElementCreationOptions,
    ) => {
      const el = originalCreate(tagName, elementOptions as ElementCreationOptions);
      if (tagName === "audio") {
        Object.defineProperty(el, "readyState", {
          configurable: true,
          get: () => HTMLMediaElement.HAVE_METADATA,
        });
        (el as HTMLAudioElement).play = options.play ?? (() => Promise.resolve());
        (
          el as HTMLMediaElement & { captureStream?: () => MediaStream }
        ).captureStream = options.captureStream as () => MediaStream;
      }
      return el;
    }) as typeof document.createElement);
  }

  it("throws when parent audio is requested but no track can be captured", async () => {
    const addTrack = vi.fn();
    const stream = { addTrack } as unknown as MediaStream;
    stubAudio({
      captureStream: () => ({ getAudioTracks: () => [] }) as unknown as MediaStream,
    });

    await expect(
      addParentAudioTrack(stream, new Blob([new Uint8Array(8)], { type: "audio/webm" })),
    ).rejects.toThrow("no_parent_audio");
    expect(addTrack).not.toHaveBeenCalled();
  });

  it("attaches a captured track only after metadata and play", async () => {
    const order: string[] = [];
    const track = { kind: "audio" } as MediaStreamTrack;
    const addTrack = vi.fn();
    const stream = { addTrack } as unknown as MediaStream;
    stubAudio({
      play: async () => {
        order.push("play");
      },
      captureStream: () => {
        order.push("capture");
        return { getAudioTracks: () => [track] } as unknown as MediaStream;
      },
    });

    await addParentAudioTrack(
      stream,
      new Blob([new Uint8Array(8)], { type: "audio/webm" }),
    );
    expect(order).toEqual(["play", "capture"]);
    expect(addTrack).toHaveBeenCalledWith(track);
  });
});


describe("drawClipCover", () => {
  it("center-crops a wide clip to the tall stamp without stretching", () => {
    const source = document.createElement("video");
    Object.defineProperty(source,"videoWidth",{value:1920});
    Object.defineProperty(source,"videoHeight",{value:1080});
    const drawImage = vi.fn();
    drawClipCover({drawImage} as unknown as CanvasRenderingContext2D, {source,x:10,y:20,width:200,height:300,mute:false,useClipAudio:true});
    expect(drawImage).toHaveBeenCalledWith(source,600,0,720,1080,10,20,200,300);
  });
});
