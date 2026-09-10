import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addParentAudioTrack,
  photoDurationsMs,
  planClipBundle,
  renderPhotoBundle,
} from "../../src/media/bundleVideo";

describe("bundleVideo", () => {
  it("spreads photos across 6 to 15 seconds without audio", () => {
    expect(photoDurationsMs(1, null).reduce((a, b) => a + b, 0)).toBe(6000);
    const three = photoDurationsMs(3, null);
    expect(three).toHaveLength(3);
    const total = three.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(6000);
    expect(total).toBeLessThanOrEqual(15000);
    expect(photoDurationsMs(2, 10)).toEqual([5000, 5000]);
  });

  it("mutes the clip only when parent audio exists", () => {
    expect(planClipBundle(true)).toEqual({
      muteClip: true,
      useParentAudio: true,
      overlayBody: true,
    });
    expect(planClipBundle(false)).toEqual({
      muteClip: false,
      useParentAudio: false,
      overlayBody: true,
    });
  });

  it("returns one video blob from dummy frames", async () => {
    const record = vi.fn(async () => new Blob([new Uint8Array(16)], { type: "video/webm" }));
    const blob = await renderPhotoBundle({
      frames: [
        { source: {} as CanvasImageSource, durationMs: 3000 },
        { source: {} as CanvasImageSource, durationMs: 3000 },
      ],
      width: 720,
      height: 1280,
      record,
    });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toMatch(/^video\//);
    expect(record).toHaveBeenCalledTimes(1);
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
