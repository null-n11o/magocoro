import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotPaper } from "../../src/media/snapshotPaper";

function paperBox(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON() {
      return {};
    },
  };
}

function mockContext() {
  return {
    scale: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
  } as unknown as CanvasRenderingContext2D;
}

describe("snapshotPaper", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects broken images instead of silently exporting missing photos", async () => {
    const paper = document.createElement("article");
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", { value: true });
    paper.append(image);
    await expect(snapshotPaper(paper)).rejects.toThrow("image");
  });
  it("waits until selected images finish decoding before painting", async () => {
    const paper = document.createElement("article");
    const image = document.createElement("img");
    let ready!: () => void;
    image.decode = () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      });
    Object.defineProperty(image, "naturalWidth", { value: 80 });
    paper.append(image);
    const context = mockContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );
    let finished = false;
    const pending = snapshotPaper(paper).then(() => {
      finished = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    ready();
    await pending;
    expect(finished).toBe(true);
  });
  it("bounds a permanently pending image decode", async () => {
    vi.useFakeTimers();
    const paper = document.createElement("article");
    const image = document.createElement("img");
    image.decode = () => new Promise(() => {});
    paper.append(image);
    const assertion = expect(snapshotPaper(paper)).rejects.toThrow(
      "image_timeout",
    );
    await vi.advanceTimersByTimeAsync(10001);
    await assertion;
    vi.useRealTimers();
  });

  it("paints a bottom-only address rule", async () => {
    const paper = document.createElement("article");
    paper.style.borderBottom = "1px solid rgb(100, 80, 60)";
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue(paperBox(100, 40));
    const context = mockContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );
    await snapshotPaper(paper);
    expect(context.fillRect).toHaveBeenCalledWith(0, 39, 100, 1);
  });
  it("returns a canvas sized from the paper box", async () => {
    const paper = document.createElement("article");
    paper.append(document.createTextNode("じいじ、ばあばへ"));
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue(
      paperBox(100, 200),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockContext(),
    );

    const canvas = await snapshotPaper(paper);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(400);
  });

  it("paints the paper onto canvas without an SVG image", async () => {
    const paper = document.createElement("article");
    paper.append(document.createTextNode("じいじ、ばあばへ"));
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue(paperBox(40, 40));
    const ImageSpy = vi.fn();
    vi.stubGlobal("Image", ImageSpy);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockContext(),
    );

    await snapshotPaper(paper);
    expect(ImageSpy).not.toHaveBeenCalled();
  });
});
