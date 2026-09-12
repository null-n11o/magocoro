/** Shared by live paper and JPEG/video snapshots; never adds letter content. */
export function paintPaperSurface(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  const light = ctx.createLinearGradient(x, y, x + width, y + height * .15);
  light.addColorStop(0, "#fffdf7");
  light.addColorStop(.45, "#faf5e9");
  light.addColorStop(1, "#f4eddf");
  ctx.fillStyle = light;
  ctx.fillRect(x, y, width, height);
  let seed = 41;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < Math.min(width * height / 35, 45000); n++) {
    const fx = random() * width;
    const fy = random() * height;
    ctx.fillStyle = n % 2 ? "rgba(126, 99, 63, .045)" : "rgba(255, 255, 255, .55)";
    ctx.fillRect(x + fx, y + fy, .5 + random() * 2, .5);
  }
  for (const ratio of [1 / 3, 2 / 3]) {
    const creaseY = y + height * ratio;
    const crease = ctx.createLinearGradient(x, creaseY - 15, x, creaseY + 18);
    crease.addColorStop(0, "rgba(133, 108, 72, 0)");
    crease.addColorStop(.40, "rgba(133, 108, 72, .045)");
    crease.addColorStop(.45, "rgba(133, 108, 72, .16)");
    crease.addColorStop(.48, "rgba(255, 255, 255, .85)");
    crease.addColorStop(.55, "rgba(255, 255, 255, .35)");
    crease.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = crease;
    ctx.fillRect(x, creaseY - 15, width, 33);
  }
  ctx.restore();
}
