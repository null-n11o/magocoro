import { describe, expect, it, vi } from "vitest";
import { shareOrSaveVideo } from "../../src/media/shareBundle";

const file = new File([new Uint8Array(8)], "magocoro.webm", { type: "video/webm" });

describe("shareOrSaveVideo", () => {
  it("shares a file when the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const save = vi.fn();
    await expect(
      shareOrSaveVideo(file, {
        canShare: () => true,
        share,
        save,
      }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when share is missing or throws", async () => {
    const save = vi.fn();
    await expect(shareOrSaveVideo(file, { canShare: () => false, save })).resolves.toBe("saved");
    await expect(
      shareOrSaveVideo(file, {
        canShare: () => true,
        share: async () => {
          throw new Error("denied");
        },
        save,
      }),
    ).resolves.toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });
});
