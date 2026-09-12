import { paintPostageBorder } from "./postageBorder";
import { paintPaperSurface } from "./paperSurface";

function contentBox(
  rect: DOMRect,
  style: CSSStyleDeclaration,
): { x: number; y: number; width: number; height: number } {
  const left = parseFloat(style.paddingLeft) || 0;
  const top = parseFloat(style.paddingTop) || 0;
  const right = parseFloat(style.paddingRight) || 0;
  const bottom = parseFloat(style.paddingBottom) || 0;
  return {
    x: rect.left + left,
    y: rect.top + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

function isTransparent(color: string): boolean {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: DOMRect,
  style: CSSStyleDeclaration,
): void {
  const color = style.backgroundColor;
  if (!color || isTransparent(color)) return;
  ctx.fillStyle = color;
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
}

function paintBorder(
  ctx: CanvasRenderingContext2D,
  rect: DOMRect,
  style: CSSStyleDeclaration,
): void {
  const sides = [
    [
      style.borderTopWidth,
      style.borderTopColor,
      rect.left,
      rect.top,
      rect.width,
      0,
    ],
    [
      style.borderRightWidth,
      style.borderRightColor,
      rect.right,
      rect.top,
      0,
      rect.height,
    ],
    [
      style.borderBottomWidth,
      style.borderBottomColor,
      rect.left,
      rect.bottom,
      rect.width,
      0,
    ],
    [
      style.borderLeftWidth,
      style.borderLeftColor,
      rect.left,
      rect.top,
      0,
      rect.height,
    ],
  ] as const;
  sides.forEach(([raw, color, x, y, width, height], index) => {
    const size = parseFloat(raw) || 0;
    if (!size || isTransparent(color)) return;
    ctx.fillStyle = color;
    ctx.fillRect(
      x - (index === 1 ? size : 0),
      y - (index === 2 ? size : 0),
      width || size,
      height || size,
    );
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (sourceWidth <= 0 || sourceHeight <= 0 || width <= 0 || height <= 0)
    return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (sourceWidth - sw) / 2;
  const sy = (sourceHeight - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(source, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

function wrapLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (text === "") return [""];
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const trial = current + ch;
    if (current.length > 0 && ctx.measureText(trial).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = trial;
    }
  }
  lines.push(current);
  return lines;
}

function paintText(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  rect: DOMRect,
  style: CSSStyleDeclaration,
  text: string,
): void {
  const box = contentBox(rect, style);
  const fontSize = parseFloat(style.fontSize) || 16;
  const lineHeightRaw = parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(lineHeightRaw)
    ? lineHeightRaw
    : fontSize * 1.2;
  ctx.fillStyle = style.color || "#33302a";
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline = "top";
  const right = style.textAlign === "right" || style.textAlign === "end";
  ctx.textAlign = right ? "right" : "left";
  const x = right ? box.x + box.width : box.x;
  let y = box.y;
  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    for (const line of wrapLine(ctx, paragraph, box.width)) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
  }
}

function paintReplaced(
  ctx: CanvasRenderingContext2D,
  el: HTMLImageElement | HTMLVideoElement,
  rect: DOMRect,
  style: CSSStyleDeclaration,
): void {
  const box = contentBox(rect, style);
  const sourceWidth =
    el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const sourceHeight =
    el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (style.objectFit === "cover") {
    drawCover(
      ctx,
      el,
      sourceWidth,
      sourceHeight,
      box.x,
      box.y,
      box.width,
      box.height,
    );
    return;
  }
  ctx.drawImage(el, box.x, box.y, box.width, box.height);
}

function paintElement(
  ctx: CanvasRenderingContext2D,
  el: Element,
  frames: Map<string, HTMLImageElement>,
): void {
  if (!(el instanceof HTMLElement) || el.tagName === "AUDIO") return;
  if (el.dataset.paperDecoration) return;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  fillRoundRect(ctx, rect, style);
  if (el.dataset.paperSurface) paintPaperSurface(ctx, rect.left, rect.top, rect.width, rect.height);
  if (el instanceof HTMLImageElement) {
    paintReplaced(ctx, el, rect, style);
    paintBorder(ctx, rect, style);
    return;
  }
  if (el instanceof HTMLVideoElement) {
    if (
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      el.videoWidth > 0
    ) {
      paintReplaced(ctx, el, rect, style);
    } else {
      const box = contentBox(rect, style);
      ctx.fillStyle = "#ddd2c2";
      ctx.fillRect(box.x, box.y, box.width, box.height);
    }
    paintBorder(ctx, rect, style);
    return;
  }
  const frame = frames.get(el.dataset.postageFrame ?? "");
  if (frame)
    paintPostageBorder(ctx, frame, rect, parseFloat(style.borderTopWidth));
  else paintBorder(ctx, rect, style);
  for (const child of el.children) paintElement(ctx, child, frames);
  if (el.children.length === 0) {
    const text = el.textContent ?? "";
    if (text.length > 0) paintText(ctx, el, rect, style, text);
  }
}

async function waitForFonts(): Promise<void> {
  const ready = document.fonts?.ready;
  if (!ready) return;
  await Promise.race([
    ready.catch(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 2000);
    }),
  ]);
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  let timeout = 0;
  let removeListeners = () => {};
  try {
    const ready =
      typeof image.decode === "function"
        ? image.decode().catch(() => {
            throw new Error("broken_image");
          })
        : image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve, reject) => {
              const loaded = () => resolve();
              const failed = () => reject(new Error("broken_image"));
              image.addEventListener("load", loaded);
              image.addEventListener("error", failed);
              removeListeners = () => {
                image.removeEventListener("load", loaded);
                image.removeEventListener("error", failed);
              };
            });
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error("image_timeout")),
          10000,
        );
      }),
    ]);
    if (!image.naturalWidth) throw new Error("broken_image");
  } finally {
    window.clearTimeout(timeout);
    removeListeners();
  }
}

export async function snapshotPaper(
  paper: HTMLElement,
): Promise<HTMLCanvasElement> {
  await waitForFonts();
  const frames = new Map<string, HTMLImageElement>();
  paper
    .querySelectorAll<HTMLElement>("[data-postage-frame]")
    .forEach((element) => {
      const url = element.dataset.postageFrame;
      if (url && !frames.has(url)) {
        const image = new Image();
        image.src = url;
        frames.set(url, image);
      }
    });
  await Promise.all(
    [...Array.from(paper.querySelectorAll("img")), ...frames.values()].map(
      waitForImage,
    ),
  );
  const box = paper.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width || paper.scrollWidth));
  const height = Math.max(1, Math.round(box.height || paper.scrollHeight));
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.scale(scale, scale);
  ctx.translate(-box.left, -box.top);
  paintElement(ctx, paper, frames);
  return canvas;
}
