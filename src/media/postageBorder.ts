/** Matches border-image-slice:150 and border-image-repeat:round for our raster asset. */
export function paintPostageBorder(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  rect: DOMRect,
  border: number,
): void {
  const slice = 150;
  const sw = source.naturalWidth;
  const sh = source.naturalHeight;
  const x = rect.left;
  const y = rect.top;
  const width = rect.width;
  const height = rect.height;
  for (const right of [false, true]) {
    for (const bottom of [false, true]) {
      ctx.drawImage(
        source,
        right ? sw - slice : 0,
        bottom ? sh - slice : 0,
        slice,
        slice,
        right ? x + width - border : x,
        bottom ? y + height - border : y,
        border,
        border,
      );
    }
  }
  const horizontal = Math.max(0, width - 2 * border);
  const vertical = Math.max(0, height - 2 * border);
  const columns = Math.max(
    1,
    Math.round(horizontal / (((sw - 2 * slice) * border) / slice)),
  );
  const rows = Math.max(
    1,
    Math.round(vertical / (((sh - 2 * slice) * border) / slice)),
  );
  for (let i = 0; i < columns; i++) {
    const tileWidth = horizontal / columns;
    for (const bottom of [false, true]) {
      ctx.drawImage(
        source,
        slice,
        bottom ? sh - slice : 0,
        sw - 2 * slice,
        slice,
        x + border + i * tileWidth,
        bottom ? y + height - border : y,
        tileWidth,
        border,
      );
    }
  }
  for (let i = 0; i < rows; i++) {
    const tileHeight = vertical / rows;
    for (const right of [false, true]) {
      ctx.drawImage(
        source,
        right ? sw - slice : 0,
        slice,
        slice,
        sh - 2 * slice,
        right ? x + width - border : x,
        y + border + i * tileHeight,
        border,
        tileHeight,
      );
    }
  }
}
