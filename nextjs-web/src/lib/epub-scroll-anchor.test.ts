import { describe, expect, it } from "vitest";

import {
  anchorCorrection,
  MIN_CORRECTION_PX,
  pickAnchorIndex,
  shouldCorrect,
} from "./epub-scroll-anchor";

describe("pickAnchorIndex", () => {
  it("picks the first child whose bottom is past the top edge", () => {
    // First two are fully scrolled above the viewport top (bottom <= 0).
    const rects = [
      { top: -800, bottom: -400 },
      { top: -400, bottom: -10 },
      { top: -10, bottom: 600 }, // straddles the top edge → anchor
      { top: 600, bottom: 1200 },
    ];
    expect(pickAnchorIndex(rects)).toBe(2);
  });

  it("picks the very first child when nothing is scrolled off yet", () => {
    expect(pickAnchorIndex([{ top: 0, bottom: 500 }, { top: 500, bottom: 900 }])).toBe(0);
  });

  it("returns -1 when there are no children", () => {
    expect(pickAnchorIndex([])).toBe(-1);
  });

  it("returns -1 when every child sits above the top edge", () => {
    expect(pickAnchorIndex([{ top: -200, bottom: -1 }])).toBe(-1);
  });
});

describe("anchorCorrection", () => {
  it("is zero when the anchor did not move", () => {
    expect(anchorCorrection(-30, -30)).toBe(0);
  });

  it("is positive (scroll down) when content above pushed the anchor down", () => {
    // A section above grew by 120px → the anchor's top moved from -30 to 90.
    expect(anchorCorrection(-30, 90)).toBe(120);
  });

  it("is negative (scroll up) when content above shrank", () => {
    expect(anchorCorrection(90, -30)).toBe(-120);
  });
});

describe("shouldCorrect", () => {
  it("ignores sub-pixel drift", () => {
    expect(shouldCorrect(0)).toBe(false);
    expect(shouldCorrect(0.4)).toBe(false);
    expect(shouldCorrect(-0.9)).toBe(false);
  });

  it("corrects at or beyond the threshold", () => {
    expect(shouldCorrect(MIN_CORRECTION_PX)).toBe(true);
    expect(shouldCorrect(120)).toBe(true);
    expect(shouldCorrect(-120)).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(shouldCorrect(5, 10)).toBe(false);
    expect(shouldCorrect(12, 10)).toBe(true);
  });
});
