import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareClip, transcodeClipTo720p } from "../../src/media/prepareClip";

function video(type: string, size: number): File {
  return new File([new Uint8Array(size)], "a.mp4", { type });
}

describe("prepareClip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves source audio by keeping supported small MP4 and WebM originals", async () => {
    for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
      const original = video(type, 2000);
      const silent = video("video/webm", 1000);
      const result = await prepareClip(original, async () => 2, async () => silent);
      expect(result).toEqual({ok:true,file:original});
      if (result.ok) expect(result.file).toBe(original);
    }
  });
  it("rejects clips longer than 30 seconds", async () => {
    const result = await prepareClip(
      video("video/mp4", 1000),
      async () => 30.2,
    );
    expect(result).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects unsupported types and oversized files", async () => {
    await expect(
      prepareClip(video("video/x-msvideo", 1000), async () => 3),
    ).resolves.toEqual({ ok: false, reason: "unsupported" });
    await expect(
      prepareClip(video("video/mp4", 8 * 1024 * 1024 + 1), async () => 3),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts MediaRecorder webm types that include a codec parameter", async () => {
    const file = video("video/webm;codecs=vp9", 1000);
    await expect(prepareClip(file, async () => 8)).resolves.toEqual({
      ok: true,
      file,
    });
  });

  it("returns the transcoded file when transcode succeeds", async () => {
    const original = video("video/quicktime", 2000);
    Object.defineProperty(original, "size", { value: 9 * 1024 * 1024 });
    const out = video("video/webm", 500);
    const transcode = vi.fn().mockResolvedValue(out);
    const result = await prepareClip(original, async () => 12, transcode);
    expect(result).toEqual({ ok: true, file: out });
    expect(transcode).toHaveBeenCalledWith(original);
  });

  it("falls back to the original when transcode fails but the file is within limits", async () => {
    const original = video("video/mp4", 2000);
    const result = await prepareClip(
      original,
      async () => 8,
      async () => {
        throw new Error("no recorder");
      },
    );
    expect(result).toEqual({ ok: true, file: original });
  });

  it("keeps the original when transcode output exceeds 8MB but the source does not", async () => {
    const original = video("video/mp4", 2000);
    const bloated = video("video/webm", 8 * 1024 * 1024 + 1);
    const result = await prepareClip(original, async () => 8, async () => bloated);
    expect(result).toEqual({ ok: true, file: original });
  });

  it("keeps the original when transcode returns an empty file", async () => {
    const original = video("video/mp4", 2000);
    const empty = video("video/webm", 0);
    const result = await prepareClip(original, async () => 8, async () => empty);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(original);
  });

  it("maps duration probe failure to unsupported", async () => {
    await expect(
      prepareClip(video("video/mp4", 1000), async () => {
        throw new Error("load_failed");
      }),
    ).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("throws when transcode sees a video with no dimensions", async () => {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: string | ElementCreationOptions,
    ) => {
      if (tagName === "video") {
        const el = originalCreate("video") as HTMLVideoElement;
        Object.defineProperty(el, "videoWidth", { configurable: true, get: () => 0 });
        Object.defineProperty(el, "videoHeight", { configurable: true, get: () => 0 });
        el.play = () => Promise.resolve();
        el.pause = () => {};
        return el;
      }
      return originalCreate(tagName, options as ElementCreationOptions);
    }) as typeof document.createElement);

    await expect(transcodeClipTo720p(video("video/mp4", 2000))).rejects.toThrow(
      "no_video",
    );
  });
});
