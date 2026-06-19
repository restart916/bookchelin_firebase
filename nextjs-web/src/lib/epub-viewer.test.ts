import { describe, expect, it } from "vitest";

import {
  buildFirebaseDownloadUrl,
  decideEdgeTurn,
  DEFAULT_VIEWER_SETTINGS,
  formatBridgeMessage,
  parseViewerSettings,
} from "./epub-viewer";

describe("parseViewerSettings", () => {
  it("returns defaults for an empty query", () => {
    expect(parseViewerSettings({})).toEqual(DEFAULT_VIEWER_SETTINGS);
  });

  it("parses fontsize, margin and theme", () => {
    expect(
      parseViewerSettings({ fontsize: "130", margin: "40", theme: "dark" }),
    ).toEqual({ cfi: undefined, fontSize: 130, sideMargin: 40, theme: "dark" });
  });

  it("decodes a url-encoded cfi (which itself contains colons/parens)", () => {
    const cfi = "epubcfi(/6/18[ch01-text]!/4/14/1:136)";
    const result = parseViewerSettings({ cfi: encodeURIComponent(cfi) });
    expect(result.cfi).toBe(cfi);
  });

  it("falls back to defaults for non-positive or NaN numbers (matches Vue)", () => {
    const result = parseViewerSettings({ fontsize: "0", margin: "abc" });
    expect(result.fontSize).toBe(DEFAULT_VIEWER_SETTINGS.fontSize);
    expect(result.sideMargin).toBe(DEFAULT_VIEWER_SETTINGS.sideMargin);
  });

  it("treats any non-'dark' theme as normal", () => {
    expect(parseViewerSettings({ theme: "sepia" }).theme).toBe("normal");
    expect(parseViewerSettings({}).theme).toBe("normal");
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseViewerSettings({ fontsize: ["110", "200"] }).fontSize).toBe(110);
  });
});

describe("formatBridgeMessage", () => {
  it("joins key and value with a single colon", () => {
    expect(formatBridgeMessage("fontsize", 120)).toBe("fontsize:120");
    expect(formatBridgeMessage("theme", "dark")).toBe("theme:dark");
  });

  it("preserves colons inside a cfi value (iOS splits on first colon only)", () => {
    const cfi = "epubcfi(/6/18!/4/14/1:136)";
    const msg = formatBridgeMessage("relocated", cfi);
    expect(msg).toBe(`relocated:${cfi}`);
    // emulate iOS _processChannel: substring after first ":"
    const i = msg.indexOf(":");
    expect(msg.slice(0, i)).toBe("relocated");
    expect(msg.slice(i + 1)).toBe(cfi);
  });
});

describe("decideEdgeTurn", () => {
  // section taller than the viewport: top=0, viewport=600, content=2000
  const tall = { clientHeight: 600, scrollHeight: 2000 };

  it("turns to next when swiping up while resting at the bottom", () => {
    expect(decideEdgeTurn({ ...tall, scrollTop: 1400, swipeDeltaY: -120 })).toBe("next");
  });

  it("turns to prev when swiping down while resting at the top", () => {
    expect(decideEdgeTurn({ ...tall, scrollTop: 0, swipeDeltaY: 120 })).toBe("prev");
  });

  it("does nothing for normal in-section scrolling (not at an edge)", () => {
    expect(decideEdgeTurn({ ...tall, scrollTop: 700, swipeDeltaY: -120 })).toBeNull();
    expect(decideEdgeTurn({ ...tall, scrollTop: 700, swipeDeltaY: 120 })).toBeNull();
  });

  it("ignores a tiny swipe at the bottom (below threshold)", () => {
    expect(decideEdgeTurn({ ...tall, scrollTop: 1400, swipeDeltaY: -20 })).toBeNull();
  });

  it("does not turn prev when swiping up at the bottom (wrong direction)", () => {
    expect(decideEdgeTurn({ ...tall, scrollTop: 1400, swipeDeltaY: 120 })).toBeNull();
  });

  it("respects the edge tolerance near (but not at) the bottom", () => {
    // 2px short of bottom is within the default 4px tolerance → still 'at bottom'
    expect(decideEdgeTurn({ ...tall, scrollTop: 1398, swipeDeltaY: -120 })).toBe("next");
  });

  it("honors custom thresholds", () => {
    expect(
      decideEdgeTurn({ ...tall, scrollTop: 1400, swipeDeltaY: -40 }, { swipeThreshold: 30 }),
    ).toBe("next");
  });
});

describe("buildFirebaseDownloadUrl", () => {
  it("matches the Web SDK getDownloadURL shape with an encoded path", () => {
    const url = buildFirebaseDownloadUrl("epub/한국단편_날개.epub", "tok-123");
    expect(url).toBe(
      "https://firebasestorage.googleapis.com/v0/b/bookchelin.appspot.com/o/" +
        encodeURIComponent("epub/한국단편_날개.epub") +
        "?alt=media&token=tok-123",
    );
  });

  it("honors a custom bucket", () => {
    const url = buildFirebaseDownloadUrl("a/b.epub", "t", "my-bucket");
    expect(url).toContain("/b/my-bucket/o/");
  });
});
