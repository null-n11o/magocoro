import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareSoundtrack,
  recordPaperCanvas,
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
    expect(keepShareKind({ media: { kind: "mixed" }, audioUrl: null })).toBe(
      "video",
    );
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
    const jpeg = await snapshotToJpeg(
      {} as HTMLCanvasElement,
      async () => new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
    );
    expect(jpeg.size).toBeGreaterThan(0);
    expect(jpeg.type).toMatch(/^image\/jpeg/);
  });
});

describe("drawClipCover", () => {
  it("center-crops a wide clip to the tall stamp without stretching", () => {
    const source = document.createElement("video");
    Object.defineProperty(source, "videoWidth", { value: 1920 });
    Object.defineProperty(source, "videoHeight", { value: 1080 });
    const drawImage = vi.fn();
    drawClipCover({ drawImage } as unknown as CanvasRenderingContext2D, {
      source,
      x: 10,
      y: 20,
      width: 200,
      height: 300,
      mute: false,
      useClipAudio: true,
    });
    expect(drawImage).toHaveBeenCalledWith(
      source,
      600,
      0,
      720,
      1080,
      10,
      20,
      200,
      300,
    );
  });
});

describe("prepareSoundtrack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("routes sound via Web Audio before recording and releases all resources", async () => {
    const track = { stop: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const destination = {
      stream: { getAudioTracks: () => [track] },
      disconnect: vi.fn(),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    const createMediaElementSource = vi.fn(() => source);
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaElementSource = createMediaElementSource;
        createMediaStreamDestination = () => destination;
        resume = resume;
        close = close;
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const stream = { addTrack: vi.fn() } as unknown as MediaStream;
    const sound = await prepareSoundtrack(stream, "/clip.mp4");
    expect(stream.addTrack).toHaveBeenCalledWith(track);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await sound.start();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    await sound.dispose();
    expect(track.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
  it("fails visibly when no audio-preserving API exists", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const stream = { addTrack: vi.fn() } as unknown as MediaStream;
    await expect(prepareSoundtrack(stream, "/clip.mp4")).rejects.toThrow(
      "no_audio_capture",
    );
  });
});

describe("recordPaperCanvas audio lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("records before starting sound, suppresses clip sound for voice, restores the player and stops tracks", async () => {
    const order: string[] = [];
    const track = { stop: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const destination = {
      stream: { getAudioTracks: () => [track] },
      disconnect: vi.fn(),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const audioElements: HTMLMediaElement[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaElementSource(element: HTMLMediaElement) {
          audioElements.push(element);
          return source;
        }
        createMediaStreamDestination() {
          return destination;
        }
        resume = async () => {};
        close = close;
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      async function (this: HTMLMediaElement) {
        order.push(this.tagName === "AUDIO" ? "sound" : "clip");
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const stream = { addTrack: vi.fn(), getTracks: () => [track] };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: () => stream,
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported = () => true;
        state = "inactive";
        mimeType = "video/mp4";
        onstop?: () => void;
        ondataavailable?: (event: { data: Blob }) => void;
        start() {
          this.state = "recording";
          order.push("record");
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({ data: new Blob(["clip"]) });
          this.onstop?.();
        }
      },
    );
    const clip = document.createElement("video");
    clip.src = "/original.mp4";
    clip.currentTime = 1;
    clip.muted = false;
    Object.defineProperty(clip, "videoWidth", { value: 320 });
    Object.defineProperty(clip, "videoHeight", { value: 180 });
    const voice = new Blob(["voice"], { type: "audio/mp4" });
    const file = await recordPaperCanvas({
      paper: document.createElement("canvas"),
      width: 320,
      height: 180,
      durationMs: 0,
      audio: voice,
      clip: {
        source: clip,
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        mute: true,
        useClipAudio: false,
      },
    });
    expect(file.size).toBeGreaterThan(0);
    expect(order[0]).toBe("record");
    expect(order).toContain("sound");
    expect(audioElements).toHaveLength(1);
    expect(clip.currentTime).toBe(1);
    expect(clip.muted).toBe(false);
    expect(close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    delete (
      HTMLCanvasElement.prototype as HTMLCanvasElement & {
        captureStream?: unknown;
      }
    ).captureStream;
  });
});
