// Pure helpers for the EPUB viewer route. Kept framework-free so they can be
// unit-tested without a browser or Firebase. The viewer is consumed by the iOS
// app (Flutter WebView, channel `flutter_webview`); these helpers preserve the
// exact query-param and bridge-message contract the app depends on.

export type EpubTheme = "normal" | "dark";

export interface ViewerSettings {
  /** epubcfi location to restore, e.g. "epubcfi(/6/18[ch01]!/4/14/1:136)". */
  cfi?: string;
  /** Font size as a percentage (epubjs theme), default 100. */
  fontSize: number;
  /** Horizontal body padding in px, default 20. */
  sideMargin: number;
  /** Color theme, default "normal". */
  theme: EpubTheme;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  cfi: undefined,
  fontSize: 100,
  sideMargin: 20,
  theme: "normal",
};

/** Bridge message event keys understood by the iOS app's `_processChannel`. */
export type BridgeEvent = "relocated" | "fontsize" | "margin" | "theme";

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toPositiveInt(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const raw = firstString(value);
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  // Match the Vue viewer: `+query.fontsize || default` — non-positive/NaN falls back.
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Parse the viewer query params the iOS app sends:
 *   ?cfi=<urlencoded epubcfi>&fontsize=<int>&margin=<int>&theme=<normal|dark>
 * Mirrors EpubViewer.vue mounted().
 */
export function parseViewerSettings(
  query: Record<string, string | string[] | undefined>,
): ViewerSettings {
  const rawCfi = firstString(query.cfi);
  let cfi: string | undefined;
  if (rawCfi) {
    try {
      cfi = decodeURIComponent(rawCfi) || undefined;
    } catch {
      // Malformed encoding — fall back to the raw value rather than throwing.
      cfi = rawCfi || undefined;
    }
  }

  const themeRaw = firstString(query.theme);
  const theme: EpubTheme = themeRaw === "dark" ? "dark" : "normal";

  return {
    cfi,
    fontSize: toPositiveInt(query.fontsize, DEFAULT_VIEWER_SETTINGS.fontSize),
    sideMargin: toPositiveInt(query.margin, DEFAULT_VIEWER_SETTINGS.sideMargin),
    theme,
  };
}

/**
 * Format a native-bridge message. The iOS app splits on the FIRST ":" only, so
 * values that themselves contain ":" (epubcfi) are preserved verbatim.
 * Must stay `${key}:${value}` to match `_processChannel`.
 */
export function formatBridgeMessage(
  event: BridgeEvent,
  value: string | number,
): string {
  return `${event}:${value}`;
}

/** Scroll + gesture state used to decide whether an edge swipe turns the page. */
export interface EdgeTurnInput {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  /** Vertical swipe delta in px (endY - startY). Negative = swipe up. */
  swipeDeltaY: number;
}

export interface EdgeTurnOptions {
  /** Minimum swipe distance (px) to count as an intentional pull. Default 60. */
  swipeThreshold?: number;
  /** Tolerance (px) for treating the scroll as resting at an edge. Default 4. */
  edgeTolerance?: number;
}

/**
 * Decide whether an at-edge swipe should turn the page. In `scrolled-doc` flow
 * epubjs renders one section at a time, so the reader gets stuck at a section's
 * end unless we call next()/prev(). This restores the old viewer's pull-to-turn:
 * swipe UP while resting at the bottom → next; swipe DOWN while at the top → prev.
 * Returns null when the swipe is normal in-section scrolling.
 */
export function decideEdgeTurn(
  input: EdgeTurnInput,
  options: EdgeTurnOptions = {},
): "next" | "prev" | null {
  const swipeThreshold = options.swipeThreshold ?? 60;
  const edgeTolerance = options.edgeTolerance ?? 4;
  const { scrollTop, clientHeight, scrollHeight, swipeDeltaY } = input;

  const atTop = scrollTop <= edgeTolerance;
  const atBottom = scrollTop + clientHeight >= scrollHeight - edgeTolerance;

  if (atBottom && swipeDeltaY <= -swipeThreshold) return "next";
  if (atTop && swipeDeltaY >= swipeThreshold) return "prev";
  return null;
}

const DEFAULT_STORAGE_BUCKET = "bookchelin.appspot.com";

/**
 * Reconstruct the tokenized Firebase Storage download URL — identical to what
 * the Web SDK `getDownloadURL()` returns — from a storage path + download token.
 * Avoids needing signed-URL credentials on App Hosting.
 */
export function buildFirebaseDownloadUrl(
  storagePath: string,
  token: string,
  bucket: string = DEFAULT_STORAGE_BUCKET,
): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
}
