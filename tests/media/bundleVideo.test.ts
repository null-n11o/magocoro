import { describe, expect, it, vi } from "vitest";
import {
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
