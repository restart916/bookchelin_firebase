import { describe, expect, it } from "vitest";

import {
  buildFirebaseDownloadUrl,
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
