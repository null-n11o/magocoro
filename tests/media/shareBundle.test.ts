import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, shareOrSaveVideo } from "../../src/media/shareBundle";

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
    expect(share).toHaveBeenCalledWith({ files: [file], title: "Magocoro" });
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

  it("does not save when the user cancels the share sheet", async () => {
    const save = vi.fn();
    const abort = new DOMException("The operation was aborted.", "AbortError");
    await expect(
      shareOrSaveVideo(file, {
        canShare: () => true,
        share: async () => {
          throw abort;
        },
        save,
      }),
    ).resolves.toBe("shared");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("downloadFile", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("appends the link and delays revoking until download can start", () => {
    vi.useFakeTimers();
    const objectUrl = "blob:http://localhost/magocoro";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadFile(file);

    const anchor = document.body.querySelector(`a[download="${file.name}"]`);
    expect(anchor).toBeInstanceOf(HTMLAnchorElement);
    expect(anchor).toHaveAttribute("href", objectUrl);
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith(objectUrl);
    expect(document.body.contains(anchor)).toBe(false);
  });
});
