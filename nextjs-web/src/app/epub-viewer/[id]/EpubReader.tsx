"use client";

import { useEffect, useRef, useState } from "react";
import type { Contents, NavItem, Rendition } from "epubjs";

import {
  decideEdgeTurn,
  formatBridgeMessage,
  type EpubTheme,
  type ViewerSettings,
} from "@/lib/epub-viewer";

/** epubjs's scroll container lives on the (untyped) manager; read it defensively. */
function getScroller(rendition: Rendition): HTMLElement | null {
  const manager = (rendition as unknown as { manager?: { container?: HTMLElement } }).manager;
  return manager?.container ?? null;
}

declare global {
  interface Window {
    // Injected by the iOS app (Flutter `addJavaScriptChannel('flutter_webview')`).
    flutter_webview?: { postMessage: (message: string) => void };
  }
}

function notifyApp(event: "relocated" | "fontsize" | "margin" | "theme", value: string | number) {
  if (typeof window !== "undefined" && window.flutter_webview) {
    window.flutter_webview.postMessage(formatBridgeMessage(event, value));
  }
}

const THEMES: Record<EpubTheme, Record<string, Record<string, string>>> = {
  normal: {
    body: { "background-color": "inherit" },
    p: { color: "inherit" },
    img: {
      "-webkit-filter": "inherit",
      filter: "inherit",
      "max-width": "100% !important",
      "max-height": "100% !important",
    },
  },
  dark: {
    body: { "background-color": "#141414" },
    p: { color: "#ffffff" },
    img: {
      "-webkit-filter": "invert(1) hue-rotate(180deg)",
      filter: "invert(1) hue-rotate(180deg)",
      "max-width": "100% !important",
      "max-height": "100% !important",
    },
  },
};

export function EpubReader({
  url,
  settings,
}: {
  url: string;
  settings: ViewerSettings;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(settings.fontSize);
  const [sideMargin, setSideMargin] = useState(settings.sideMargin);
  const [theme, setTheme] = useState<EpubTheme>(settings.theme);

  // Keep the latest values for use inside epubjs callbacks without re-binding.
  const fontSizeRef = useRef(fontSize);
  const sideMarginRef = useRef(sideMargin);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);
  useEffect(() => {
    sideMarginRef.current = sideMargin;
  }, [sideMargin]);

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
        flow: "scrolled-doc",
      });
      renditionRef.current = rendition;
      cleanupBook = () => {
        rendition.destroy();
        book.destroy();
      };

      rendition.themes.register("normal", THEMES.normal);
      rendition.themes.register("dark", THEMES.dark);

      book.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc ?? []);
      });

      // Restore the old viewer's pull-to-turn gesture: in scrolled-doc flow
      // epubjs shows one section at a time, so reaching an edge must call
      // next()/prev(). Swipe up at the bottom → next, swipe down at the top → prev.
      let touchStartY = 0;
      let transitioning = false;
      let movePrev = false;
      rendition.hooks.content.register((contents: Contents) => {
        const doc = contents.document;
        doc.addEventListener(
          "touchstart",
          (e: Event) => {
            touchStartY = (e as TouchEvent).changedTouches[0]?.clientY ?? 0;
          },
          { passive: true },
        );
        doc.addEventListener(
          "touchend",
          (e: Event) => {
            if (transitioning) return;
            const el = getScroller(rendition);
            if (!el) return;
            const endY = (e as TouchEvent).changedTouches[0]?.clientY ?? touchStartY;
            const decision = decideEdgeTurn({
              scrollTop: el.scrollTop,
              clientHeight: el.clientHeight,
              scrollHeight: el.scrollHeight,
              swipeDeltaY: endY - touchStartY,
            });
            if (decision === "next" || decision === "prev") {
              transitioning = true;
              movePrev = decision === "prev";
              if (decision === "next") rendition.next();
              else rendition.prev();
              // Fallback: at the first/last section the turn is a no-op and
              // "relocated" never fires, so unlock the gesture after a beat.
              window.setTimeout(() => {
                transitioning = false;
              }, 1000);
            }
          },
          { passive: true },
        );
      });

      rendition.on("relocated", (location: { end?: { cfi?: string } }) => {
        const cfi = location?.end?.cfi;
        if (cfi) notifyApp("relocated", cfi);
        // epubjs resets injected theme rules per section — reapply.
        applyFontSize(rendition, fontSizeRef.current);
        applySideMargin(rendition, sideMarginRef.current);
        // Arrived via prev(): show the end of the section so reading flows backward.
        if (movePrev) {
          const el = getScroller(rendition);
          if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
        }
        movePrev = false;
        transitioning = false;
      });

      rendition.themes.select(theme);
      applyFontSize(rendition, settings.fontSize);
      applySideMargin(rendition, settings.sideMargin);

      await rendition.display(settings.cfi);
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
    setFontSize(value);
    applyFontSize(renditionRef.current, value);
    notifyApp("fontsize", value);
  }

  function changeSideMargin(next: number) {
    const value = Math.max(0, next);
    setSideMargin(value);
    applySideMargin(renditionRef.current, value);
    notifyApp("margin", value);
  }

  function changeTheme(next: EpubTheme) {
    setTheme(next);
    const rendition = renditionRef.current;
    if (rendition) {
      rendition.themes.select(next);
      // Re-applying size/margin keeps them after a theme swap.
      applyFontSize(rendition, fontSizeRef.current);
      applySideMargin(rendition, sideMarginRef.current);
    }
    notifyApp("theme", next);
  }

  function goPrev() {
    renditionRef.current?.prev();
  }
  function goNext() {
    renditionRef.current?.next();
  }
  function openChapter(item: NavItem) {
    renditionRef.current?.display(item.href);
    setShowToc(false);
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
        <button type="button" onClick={() => changeFontSize(fontSize - 10)}>
          가-
        </button>
        <button type="button" onClick={() => changeFontSize(fontSize + 10)}>
          가+
        </button>
        {theme !== "normal" && (
          <button type="button" onClick={() => changeTheme("normal")}>
            라이트
          </button>
        )}
        {theme !== "dark" && (
          <button type="button" onClick={() => changeTheme("dark")}>
            다크
          </button>
        )}
        <button type="button" onClick={() => changeSideMargin(sideMargin - 10)}>
          여백-
        </button>
        <button type="button" onClick={() => changeSideMargin(sideMargin + 10)}>
          여백+
        </button>
        <button type="button" onClick={goPrev}>
          이전
        </button>
        <button type="button" onClick={goNext}>
          다음
        </button>
        <button type="button" onClick={() => setShowToc(true)} aria-label="목차">
          목차
        </button>
      </div>

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
.epub-bar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 8px 12px; border-top: 1px solid #777; background: #fff; flex-wrap: wrap; }
.epub-bar button { background: none; border: none; font-size: 15px; color: #212121; cursor: pointer; padding: 4px 2px; }
.epub-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.epub-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #eee; border-top-color: #ff1d5e; animation: epub-spin 1s linear infinite; }
@keyframes epub-spin { to { transform: rotate(360deg); } }
.epub-toc-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.4); display: flex; justify-content: flex-end; }
.epub-toc { width: min(80%, 320px); height: 100%; background: #fff; overflow-y: auto; box-shadow: -2px 0 8px rgba(0,0,0,0.2); }
.epub-toc__head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: 600; }
.epub-toc__head button { background: none; border: none; font-size: 16px; cursor: pointer; }
.epub-toc ul { list-style: none; margin: 0; padding: 0; }
.epub-toc li button { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid #f2f2f2; padding: 12px 16px; font-size: 14px; color: #212121; cursor: pointer; }
`;

function applyFontSize(rendition: Rendition | null, percent: number) {
  rendition?.themes.default({ p: { "font-size": `${percent}% !important` } });
}

function applySideMargin(rendition: Rendition | null, px: number) {
  rendition?.themes.default({ body: { padding: `0px ${px}px !important` } });
}
