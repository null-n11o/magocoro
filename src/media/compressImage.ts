export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_TARGET_BYTES = 400 * 1024;
export const IMAGE_HARD_MAX_BYTES = 1024 * 1024;

export type CompressImageDeps = {
  load: (file: File) => Promise<{
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  }>;
  toJpeg: (canvas: HTMLCanvasElement, quality: number) => Promise<Blob>;
};

export const browserImageDeps: CompressImageDeps = {
  async load(file) {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
      },
    };
  },
  toJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
        "image/jpeg",
        quality,
      );
    });
  },
};

export async function compressImage(
  file: File,
  deps: CompressImageDeps = browserImageDeps,
): Promise<File> {
  const image = await deps.load(file);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  image.draw(ctx, width, height);

  let quality = 0.82;
  let blob = await deps.toJpeg(canvas, quality);
  while (blob.size > IMAGE_TARGET_BYTES && quality > 0.4) {
    quality -= 0.14;
    blob = await deps.toJpeg(canvas, quality);
  }
  if (blob.size > IMAGE_HARD_MAX_BYTES) throw new Error("too_large");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
