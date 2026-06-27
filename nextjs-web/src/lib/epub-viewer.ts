// Pure helpers for the EPUB viewer route. Kept framework-free so they can be
// unit-tested without a browser or Firebase. The viewer is consumed by the iOS
// app (Flutter WebView, channel `flutter_webview`); these helpers preserve the
// exact query-param and bridge-message contract the app depends on.

export type EpubTheme = "normal" | "dark";

/** 한국어 폰트 ID 목록 (웹폰트 로드 + epub.js fontFamily 적용). */
export type EpubFont = "sans" | "serif" | "gothic";

export interface FontOption {
  id: EpubFont;
  label: string;
  /** Google Fonts URL fragment for the <link> tag injected into the EPUB iframe. */
  googleFontParam: string | null;
  /** CSS font-family value applied via themes.default(). */
  css: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "sans",
    label: "고딕",
    googleFontParam: "Noto+Sans+KR:wght@400;700",
    css: "'Noto Sans KR', sans-serif",
  },
  {
    id: "serif",
    label: "명조",
    googleFontParam: "Noto+Serif+KR:wght@400;700",
    css: "'Noto Serif KR', serif",
  },
  {
    id: "gothic",
    label: "도서",
    googleFontParam: "Nanum+Gothic:wght@400;700",
    css: "'Nanum Gothic', sans-serif",
  },
];

export const DEFAULT_FONT: EpubFont = "sans";

export interface ViewerSettings {
  /** epubcfi location to restore, e.g. "epubcfi(/6/18[ch01]!/4/14/1:136)". */
  cfi?: string;
  /** Font size as a percentage (epubjs theme), default 100. */
  fontSize: number;
  /** Horizontal body padding in px, default 20. */
  sideMargin: number;
  /** Color theme, default "normal". */
  theme: EpubTheme;
  /** Korean font selection, default "sans". */
  font: EpubFont;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  cfi: undefined,
  fontSize: 100,
  sideMargin: 20,
  theme: "normal",
  font: DEFAULT_FONT,
};

/** Bridge message event keys understood by the iOS app's `_processChannel`. */
export type BridgeEvent = "relocated" | "fontsize" | "margin" | "theme" | "font";

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

  const fontRaw = firstString(query.font);
  const font: EpubFont =
    FONT_OPTIONS.some((f) => f.id === fontRaw) ? (fontRaw as EpubFont) : DEFAULT_FONT;

  return {
    cfi,
    fontSize: toPositiveInt(query.fontsize, DEFAULT_VIEWER_SETTINGS.fontSize),
    sideMargin: toPositiveInt(query.margin, DEFAULT_VIEWER_SETTINGS.sideMargin),
    theme,
    font,
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
