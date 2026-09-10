import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage, type CompressImageDeps } from "../../src/media/compressImage";

function depsWith(
  width: number,
  height: number,
  sizes: number[],
): CompressImageDeps {
  const toJpeg = vi.fn();
  for (const size of sizes) {
    toJpeg.mockResolvedValueOnce(
      new Blob([new Uint8Array(size)], { type: "image/jpeg" }),
    );
  }
  return {
    async load() {
      return {
        width,
        height,
        draw() {},
      };
    },
    toJpeg,
  };
}

describe("compressImage", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
    } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resizes a long edge above 1280 and returns a jpeg under the hard limit", async () => {
    const deps = depsWith(4000, 3000, [200 * 1024]);
    const input = new File([new Uint8Array(80)], "cam.png", { type: "image/png" });
    const out = await compressImage(input, deps);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo.jpg");
    expect(out.size).toBe(200 * 1024);
    expect(deps.toJpeg).toHaveBeenCalled();
  });

  it("lowers jpeg quality until the blob is at most 400KB", async () => {
    const deps = depsWith(1280, 960, [500 * 1024, 300 * 1024]);
    const out = await compressImage(
      new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" }),
      deps,
    );
    expect(out.size).toBe(300 * 1024);
    expect(deps.toJpeg).toHaveBeenCalledTimes(2);
  });

  it("throws when the jpeg stays above 1MB", async () => {
    const deps = depsWith(1280, 960, [2 * 1024 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024]);
    await expect(
      compressImage(
        new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" }),
        deps,
      ),
    ).rejects.toThrow("too_large");
  });
});
