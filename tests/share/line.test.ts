import { describe, expect, it } from "vitest";
import { LINE_FRIEND_URL, lineShareUrl } from "../../src/share/line";

describe("LINE links", () => {
  it("encodes the complete letter URL including reserved characters", () => {
    expect(lineShareUrl("https://example.com/letter/l_abc?x=1&y=二#三")).toBe(
      "https://line.me/R/msg/text/?https%3A%2F%2Fexample.com%2Fletter%2Fl_abc%3Fx%3D1%26y%3D%E4%BA%8C%23%E4%B8%89",
    );
  });

  it("uses the official Magocoro friend-add URL", () => {
    expect(LINE_FRIEND_URL).toBe("https://line.me/R/ti/p/%40039ijxbe");
  });
});
