import { describe, expect, it } from "vitest";
import { prepareAudio } from "../../src/media/prepareAudio";

function voice(type: string, size: number): File {
  return new File([new Uint8Array(size)], "a.webm", { type });
}

describe("prepareAudio", () => {
  it("rejects audio longer than 30 seconds", async () => {
    await expect(
      prepareAudio(voice("audio/webm", 100), async () => 31),
    ).resolves.toEqual({ ok: false, reason: "too_long" });
  });

  it("accepts short opus or aac without audio", async () => {
    const file = voice("audio/webm", 2048);
    await expect(prepareAudio(file, async () => 6)).resolves.toEqual({
      ok: true,
      file,
    });
  });

  it("rejects mp3 and files over 1MB", async () => {
    await expect(
      prepareAudio(voice("audio/mpeg", 100), async () => 2),
    ).resolves.toEqual({ ok: false, reason: "unsupported" });
    await expect(
      prepareAudio(voice("audio/webm", 1024 * 1024 + 1), async () => 2),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });
});
