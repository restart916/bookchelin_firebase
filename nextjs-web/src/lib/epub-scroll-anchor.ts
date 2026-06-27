// Pure geometry helpers for keeping the reader pinned to what it is currently
// looking at while epub.js's continuous manager streams sections in/out and
// resizes them (late image/font layout, font-size / margin changes, etc.).
//
// DOM-free so they can be unit-tested without a browser. EpubReader wires these
// to the scroll container via ResizeObserver / MutationObserver / scroll.

/** A child view box measured relative to the scroll container's top edge (px). */
export interface ViewportRect {
  /** Top edge relative to the container's top edge. Negative = scrolled above. */
  top: number;
  /** Bottom edge relative to the container's top edge. */
  bottom: number;
}

/**
 * Pick the anchor view: the first child still visible at/below the container's
 * top edge (its bottom is past the top edge). That is the section the reader is
 * actually looking at, so it is the one we keep visually fixed across layout
 * changes. Returns the index, or -1 when nothing qualifies (empty/torn down).
 */
export function pickAnchorIndex(rects: ViewportRect[]): number {
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].bottom > 0) return i;
  }
  return -1;
}

/**
 * Pixels to add to scrollTop so the anchor returns to where it was: if the
 * anchor's top drifted from `savedTop` to `currentTop`, scrolling by the drift
 * re-pins it. Positive → scroll down.
 */
export function anchorCorrection(savedTop: number, currentTop: number): number {
  return currentTop - savedTop;
}

/** Sub-pixel drift we ignore so we never fight the browser over <1px. */
export const MIN_CORRECTION_PX = 1;

/** Whether a drift is large enough to be worth correcting. */
export function shouldCorrect(delta: number, threshold = MIN_CORRECTION_PX): boolean {
  return Math.abs(delta) >= threshold;
}
