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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a canvas sized from the paper box", async () => {
    const paper = document.createElement("article");
    paper.append(document.createTextNode("じいじ、ばあばへ"));
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue(paperBox(100, 200));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext());

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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext());

    await snapshotPaper(paper);
    expect(ImageSpy).not.toHaveBeenCalled();
  });
});
