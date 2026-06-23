"use client";

import { useEffect, useRef, useState } from "react";
import type { NavItem, Rendition } from "epubjs";

import {
  formatBridgeMessage,
  FONT_OPTIONS,
  type EpubFont,
  type EpubTheme,
  type ViewerSettings,
} from "@/lib/epub-viewer";
import {
  displayInitialSection,
  runGuardedTocDisplay,
  TocPreloadGuard,
} from "@/lib/epub-toc-navigation";

declare global {
  interface Window {
    // Injected by the iOS app (Flutter `addJavaScriptChannel('flutter_webview')`).
    flutter_webview?: { postMessage: (message: string) => void };
  }
}

function notifyApp(event: "relocated" | "fontsize" | "margin" | "theme" | "font", value: string | number) {
  if (typeof window !== "undefined" && window.flutter_webview) {
    window.flutter_webview.postMessage(formatBridgeMessage(event, value));
  }
}

export function EpubReader({
  url,
  settings,
}: {
  url: string;
  settings: ViewerSettings;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocPreloadGuardRef = useRef<TocPreloadGuard | null>(null);
  const tocNavigationRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontSize, setFontSize] = useState(settings.fontSize);
  const [sideMargin, setSideMargin] = useState(settings.sideMargin);
  const [theme, setTheme] = useState<EpubTheme>(settings.theme);
  const [font, setFont] = useState<EpubFont>(settings.font);

  // Keep the latest values for use inside epubjs callbacks without re-binding.
  const fontSizeRef = useRef(fontSize);
  const sideMarginRef = useRef(sideMargin);
  const themeRef = useRef(theme);
  const fontRef = useRef(font);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { sideMarginRef.current = sideMargin; }, [sideMargin]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { fontRef.current = font; }, [font]);

  useEffect(() => {
    let cancelled = false;
    let cleanupBook: (() => void) | undefined;

    (async () => {
      const ePub = (await import("epubjs")).default;
      if (cancelled || !viewerRef.current) return;

      const book = ePub(url);
      const rendition = book.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        // Continuous scroll: sections stream in as you scroll, so the reader
        // never dead-ends at a chapter boundary (no pull-to-turn needed).
        manager: "continuous",
        flow: "scrolled",
      });
      renditionRef.current = rendition;
      cleanupBook = () => {
        tocPreloadGuardRef.current?.destroy();
        tocPreloadGuardRef.current = null;
        rendition.destroy();
        book.destroy();
      };

      book.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc ?? []);
      });

      rendition.on("relocated", (location: { end?: { cfi?: string } }) => {
        const cfi = location?.end?.cfi;
        if (cfi) notifyApp("relocated", cfi);
      });

      // Inject Google Fonts into each chapter iframe so Korean font-family works.
      rendition.hooks.content.register((contents: unknown) => {
        const doc = (contents as { document?: Document }).document;
        if (!doc || !doc.head) return;
        const existing = doc.getElementById("bk-gfonts");
        if (existing) existing.remove();
        const link = doc.createElement("link");
        link.id = "bk-gfonts";
        link.rel = "stylesheet";
        link.href =
          "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Nanum+Gothic:wght@400;700&display=swap";
        doc.head.appendChild(link);
      });

      // Intercept internal EPUB link clicks in capture phase before WKWebView can
      // act on them. epubjs's built-in handleLinks calls
      //   rendition.display(book.path.relative(href))
      // which resolves to "../chap_01.xhtml" (wrong) because book.path.directory is
      // "EPUB/" and path.relative("EPUB/", "chap_01.xhtml") = "../chap_01.xhtml".
      // spine.get("../chap_01.xhtml") returns null, JS fails silently, then
      // WKWebView navigates the whole WebView to the relative URL → Next.js 404.
      // Fix: hook into each section's document with a capture listener that
      // calls rendition.display(rawHref) directly — spine is indexed by the raw
      // manifest href ("chap_01.xhtml") so lookup succeeds.
      rendition.hooks.content.register((contents: unknown) => {
        const doc = (contents as { document?: Document }).document;
        if (!doc) return;
        doc.addEventListener(
          "click",
          (e: Event) => {
            const link = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
            if (!link) return;
            const href = link.getAttribute("href");
            if (!href) return;
            // Leave external / mailto links alone.
            if (href.startsWith("http") || href.startsWith("//") || href.startsWith("mailto:")) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            rendition.display(href);
          },
          true, // capture — fires before onclick and before WKWebView native handling
        );
      });

      // Single themes.default() call covers theme + fontSize + sideMargin + font in one
      // stylesheet block. Avoids the epubjs cascade bug where each named-theme
      // stylesheet (<style id="epubjs-inserted-css-dark">) keeps a permanent DOM
      // position: switching back to "normal" via themes.select() added the normal
      // stylesheet *before* the dark one, so dark always won in the cascade.
      applyAllSettings(rendition, settings.theme, settings.fontSize, settings.sideMargin, settings.font);

      const tocPreloadGuard = await displayInitialSection(
        rendition as unknown as Parameters<typeof displayInitialSection>[0],
        settings.cfi,
      );
      if (cancelled) {
        tocPreloadGuard?.destroy();
        return;
      }
      tocPreloadGuardRef.current = tocPreloadGuard;
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      cleanupBook?.();
      renditionRef.current = null;
    };
    // Mount-only: settings/theme are seeds; later changes go through handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function changeFontSize(next: number) {
    const value = Math.max(10, next);
    fontSizeRef.current = value;
    setFontSize(value);
    applyAllSettings(renditionRef.current, themeRef.current, value, sideMarginRef.current, fontRef.current);
    notifyApp("fontsize", value);
  }

  function changeSideMargin(next: number) {
    const value = Math.max(0, next);
    sideMarginRef.current = value;
    setSideMargin(value);
    applyAllSettings(renditionRef.current, themeRef.current, fontSizeRef.current, value, fontRef.current);
    notifyApp("margin", value);
  }

  function changeTheme(next: EpubTheme) {
    themeRef.current = next;
    setTheme(next);
    applyAllSettings(renditionRef.current, next, fontSizeRef.current, sideMarginRef.current, fontRef.current);
    notifyApp("theme", next);
  }

  function changeFont(next: EpubFont) {
    fontRef.current = next;
    setFont(next);
    applyAllSettings(renditionRef.current, themeRef.current, fontSizeRef.current, sideMarginRef.current, next);
    notifyApp("font", next);
  }

  function goPrev() {
    renditionRef.current?.prev();
  }
  function goNext() {
    renditionRef.current?.next();
  }
  async function openChapter(item: NavItem) {
    const rendition = renditionRef.current;
    if (!rendition || tocNavigationRef.current) return;

    tocNavigationRef.current = true;
    setShowToc(false);
    try {
      const guard = tocPreloadGuardRef.current;
      if (guard) {
        await runGuardedTocDisplay(guard, () => rendition.display(item.href));
      } else {
        await rendition.display(item.href);
      }
    } catch (error) {
      console.error("Failed to display EPUB TOC target", error);
    } finally {
      tocNavigationRef.current = false;
    }
  }

  return (
    <div className={`epub-root epub-${theme}`}>
      {loading && (
        <div className="epub-loading" role="status" aria-label="로딩 중">
          <div className="epub-spinner" />
        </div>
      )}

      <div ref={viewerRef} className="epub-viewport" />

      <div className="epub-bar">
        <button type="button" onClick={() => changeFontSize(fontSize - 10)}>가-</button>
        <button type="button" onClick={() => changeFontSize(fontSize + 10)}>가+</button>
        <button
          type="button"
          className={theme === "dark" ? "epub-bar-btn-active" : ""}
          onClick={() => changeTheme(theme === "dark" ? "normal" : "dark")}
        >
          다크
        </button>
        <button type="button" onClick={() => changeSideMargin(sideMargin - 10)}>여백-</button>
        <button type="button" onClick={() => changeSideMargin(sideMargin + 10)}>여백+</button>
        <button
          type="button"
          className={showFontPicker ? "epub-bar-btn-active" : ""}
          onClick={() => setShowFontPicker((v) => !v)}
        >
          글꼴
        </button>
        <button type="button" onClick={goPrev}>이전</button>
        <button type="button" onClick={goNext}>다음</button>
        <button type="button" onClick={() => setShowToc(true)} aria-label="목차">목차</button>
      </div>

      {showFontPicker && (
        <>
          <div className="epub-font-picker-backdrop" onClick={() => setShowFontPicker(false)} />
          <div className="epub-font-picker" role="listbox" aria-label="폰트 선택">
            {FONT_OPTIONS.map((fo) => (
              <button
                key={fo.id}
                type="button"
                role="option"
                aria-selected={font === fo.id}
                className={font === fo.id ? "epub-font-picker-active" : ""}
                onClick={() => { changeFont(fo.id); setShowFontPicker(false); }}
              >
                {fo.label}
              </button>
            ))}
          </div>
        </>
      )}

      {showToc && (
        <div className="epub-toc-backdrop" onClick={() => setShowToc(false)}>
          <nav className="epub-toc" onClick={(e) => e.stopPropagation()}>
            <header className="epub-toc__head">
              <span>목차</span>
              <button type="button" onClick={() => setShowToc(false)} aria-label="닫기">
                ✕
              </button>
            </header>
            <ul>
              {toc.map((item, i) => (
                <li key={`${item.href}-${i}`}>
                  <button type="button" onClick={() => openChapter(item)}>
                    {item.label?.trim() || "(제목 없음)"}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: READER_CSS }} />
    </div>
  );
}

const READER_CSS = `
html, body { height: 100%; margin: 0; }
.epub-root { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; background: #fff; }
.epub-root.epub-dark { background: #141414; }
.epub-viewport { flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.epub-viewport .epub-container { overflow-anchor: none; }
.epub-bar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; padding: 8px 12px; padding-bottom: max(8px, env(safe-area-inset-bottom)); border-top: 1px solid #777; background: #fff; flex-wrap: nowrap; overflow-x: auto; }
.epub-bar button { background: none; border: none; font-size: 13px; color: #212121; cursor: pointer; padding: 4px 2px; white-space: nowrap; flex-shrink: 0; }
.epub-bar .epub-bar-btn-active { color: #ff1d5e; font-weight: 700; }
.epub-root.epub-dark .epub-bar { background: #1c1c1c; border-top-color: #444; }
.epub-root.epub-dark .epub-bar button { color: #e0e0e0; }
.epub-root.epub-dark .epub-bar .epub-bar-btn-active { color: #ff6b8a; }
.epub-font-picker-backdrop { position: fixed; inset: 0; z-index: 10000; }
.epub-font-picker { position: fixed; bottom: calc(48px + max(8px, env(safe-area-inset-bottom))); right: 16px; z-index: 10001; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 6px 4px; display: flex; flex-direction: column; gap: 2px; min-width: 80px; box-shadow: 0 -2px 12px rgba(0,0,0,0.18); }
.epub-font-picker button { font-size: 14px; padding: 10px 16px; border-radius: 6px; width: 100%; text-align: center; background: none; border: none; cursor: pointer; color: #212121; white-space: nowrap; }
.epub-font-picker button:hover { background: #f5f5f5; }
.epub-font-picker .epub-font-picker-active { color: #ff1d5e; font-weight: 700; }
.epub-root.epub-dark .epub-font-picker { background: #2a2a2a; border-color: #555; }
.epub-root.epub-dark .epub-font-picker button { color: #e0e0e0; }
.epub-root.epub-dark .epub-font-picker button:hover { background: #3a3a3a; }
.epub-root.epub-dark .epub-font-picker .epub-font-picker-active { color: #ff6b8a; }
.epub-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.epub-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #eee; border-top-color: #ff1d5e; animation: epub-spin 1s linear infinite; }
@keyframes epub-spin { to { transform: rotate(360deg); } }
.epub-toc-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.4); display: flex; justify-content: flex-end; }
.epub-toc { width: min(80%, 320px); height: 100%; background: #fff; overflow-y: auto; box-shadow: -2px 0 8px rgba(0,0,0,0.2); }
.epub-root.epub-dark .epub-toc { background: #1c1c1c; }
.epub-toc__head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: 600; color: #212121; }
.epub-root.epub-dark .epub-toc__head { border-bottom-color: #444; color: #e0e0e0; }
.epub-toc__head button { background: none; border: none; font-size: 16px; cursor: pointer; color: inherit; }
.epub-toc ul { list-style: none; margin: 0; padding: 0; }
.epub-toc li button { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid #f2f2f2; padding: 12px 16px; font-size: 14px; color: #212121; cursor: pointer; }
.epub-root.epub-dark .epub-toc li button { color: #e0e0e0; border-bottom-color: #2e2e2e; }
`;

/**
 * Apply all viewer settings (theme + fontSize + sideMargin + font) in a single
 * themes.default() call so they land in one <style> block inside the EPUB
 * iframe. This avoids the epubjs cascade ordering bug: named-theme stylesheets
 * created by themes.select() get a fixed DOM position when first inserted;
 * switching between "dark" and "normal" just adds rules to whichever sheet was
 * inserted first, so the sheet inserted later always wins in the cascade.
 * Using themes.default() exclusively means every call appends to the *same*
 * sheet (epubjs-inserted-css-default), so the most-recent call always wins.
 */
function applyAllSettings(
  rendition: Rendition | null,
  theme: EpubTheme,
  fontSize: number,
  sideMargin: number,
  font: EpubFont,
) {
  if (!rendition) return;
  const dark = theme === "dark";
  const fontCss = FONT_OPTIONS.find((f) => f.id === font)?.css ?? "inherit";
  rendition.themes.default({
    body: {
      "background-color": dark ? "#141414" : "inherit",
      padding: `0px ${sideMargin}px !important`,
      "font-family": `${fontCss} !important`,
    },
    p: {
      color: dark ? "#ffffff" : "inherit",
      "font-size": `${fontSize}% !important`,
      "font-family": `${fontCss} !important`,
    },
    span: {
      "font-family": `${fontCss} !important`,
    },
    img: {
      // No filter in dark mode — images should show in natural colours.
      // Body bg + p colour are enough; no page-level invert to counter.
      "max-width": "100% !important",
      "max-height": "100% !important",
    },
  });
}
