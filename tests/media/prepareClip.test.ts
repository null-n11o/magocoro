import { describe, expect, it, vi } from "vitest";
import { prepareClip } from "../../src/media/prepareClip";

function video(type: string, size: number): File {
  return new File([new Uint8Array(size)], "a.mp4", { type });
}

describe("prepareClip", () => {
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

  it("returns the transcoded file when transcode succeeds", async () => {
    const original = video("video/quicktime", 2000);
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
});
