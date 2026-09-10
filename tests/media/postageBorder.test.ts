import { describe, expect, it, vi } from "vitest";
import { paintPostageBorder } from "../../src/media/postageBorder";

describe("postage raster border", () => {
  it("draws four corners and rounded repeating edges, leaving the center unpainted", () => {
    const drawImage = vi.fn();
    const source = {
      naturalWidth: 1254,
      naturalHeight: 1254,
    } as HTMLImageElement;
    paintPostageBorder(
      { drawImage } as unknown as CanvasRenderingContext2D,
      source,
      { left: 10, top: 20, width: 250, height: 180 } as DOMRect,
      14,
    );
    expect(drawImage).toHaveBeenCalledWith(
      source,
      0,
      0,
      150,
      150,
      10,
      20,
      14,
      14,
    );
    expect(drawImage).toHaveBeenCalledWith(
      source,
      1104,
      1104,
      150,
      150,
      246,
      186,
      14,
      14,
    );
    expect(drawImage.mock.calls.length).toBeGreaterThan(8);
    expect(
      drawImage.mock.calls.every((call) => call[1] !== 150 || call[2] !== 150),
    ).toBe(true);
  });
});
