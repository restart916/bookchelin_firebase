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
import {
  anchorCorrection,
  pickAnchorIndex,
  shouldCorrect,
} from "@/lib/epub-scroll-anchor";

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
  const scrollAnchorCleanupRef = useRef<(() => void) | null>(null);

  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontSize, setFontSize] = useState(settings.fontSize);
  const [sideMargin, setSideMargin] = useState(settings.sideMargin);
  const [theme, setTheme] = useState<EpubTheme>(settings.theme);
  const [font, setFont] = useState<EpubFont>(settings.font);

  // 본문 선택 → 공유 이미지 (wimouniv /api/share-image).
  const [meta, setMeta] = useState<{ title: string; author: string }>({ title: "", author: "" });
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null); // null = 모달 닫힘
  const [shareLoading, setShareLoading] = useState(false);
  const metaRef = useRef(meta);
  // 마지막으로 선택된 본문(공유에 사용). 선택 해제로 버튼이 숨어도 값은 유지 — 버튼 탭 race 방지.
  const selectedTextRef = useRef<string>("");
  useEffect(() => { metaRef.current = meta; }, [meta]);

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
    let selPollId: ReturnType<typeof setInterval> | null = null;

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
        if (selPollId) { clearInterval(selPollId); selPollId = null; }
        scrollAnchorCleanupRef.current?.();
        scrollAnchorCleanupRef.current = null;
        tocPreloadGuardRef.current?.destroy();
        tocPreloadGuardRef.current = null;
        rendition.destroy();
        book.destroy();
      };

      book.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc ?? []);
      });

      // 책 제목/저자 — 공유 이미지에 사용 (EPUB content.opf 메타데이터).
      book.loaded.metadata.then((m: { title?: string; creator?: string }) => {
        if (!cancelled) setMeta({ title: m?.title ?? "", author: m?.creator ?? "" });
      });

      rendition.on("relocated", (location: { end?: { cfi?: string } }) => {
        const cfi = location?.end?.cfi;
        if (cfi) notifyApp("relocated", cfi);
      });

      // 본문 드래그 선택 → 하단 "공유하기" 노출. epubjs 'selected'는 선택 확정 시 발화.
      rendition.on("selected", (_cfiRange: string, contents: unknown) => {
        const win = (contents as { window?: Window })?.window;
        const text = win?.getSelection?.()?.toString?.().trim();
        if (text) {
          const capped = capShareText(text);
          selectedTextRef.current = capped;
          setSelectedText(capped);
        }
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

      // 선택 텍스트 감지 — 이벤트 비의존(폴링).
      // iOS WebKit은 iframe 내부 selectionchange/touch 이벤트가 안정적으로 발화하지
      // 않아(네이티브 선택 메뉴는 떠도 JS 이벤트는 안 옴) 이벤트 기반은 신뢰 불가.
      // 대신 짧은 주기로 각 섹션 iframe의 getSelection()을 직접 읽어 선택을 감지한다.
      // (epubjs도 iframe getSelection을 쓰고 iOS에서 동작 → "값 읽기"는 되고 "이벤트"만
      //  안 오는 문제를 폴링이 우회.) 값이 바뀔 때만 setState 해 리렌더 churn 방지.
      let lastPolled: string | null = null;
      const pollSelection = () => {
        const root = viewerRef.current;
        if (!root) return;
        let found = "";
        const iframes = root.querySelectorAll("iframe");
        for (let i = 0; i < iframes.length; i++) {
          try {
            const sel = iframes[i].contentWindow?.getSelection?.();
            const t = sel ? sel.toString().trim() : "";
            if (t) { found = t; break; }
          } catch {
            /* iframe 로딩 중/접근 불가 — 무시 */
          }
        }
        const next = found ? capShareText(found) : null;
        if (next === lastPolled) return;
        lastPolled = next;
        // 선택이 비어도 ref 는 유지(버튼 탭 시 선택 해제로 텍스트를 잃는 race 방지).
        if (next) selectedTextRef.current = next;
        setSelectedText(next);
      };
      selPollId = setInterval(pollSelection, 350);

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

      // Keep the reader pinned to what it is looking at when the continuous
      // manager streams/resizes sections mid-scroll (and on font/margin changes).
      const container = getScrollContainer(rendition);
      if (container) {
        scrollAnchorCleanupRef.current = attachScrollAnchorKeeper(container);
      }

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

  function openShare() {
    const text = selectedTextRef.current;
    if (!text) return;
    const qs = new URLSearchParams({
      title: metaRef.current.title,
      author: metaRef.current.author,
      content: text,
    });
    setShareUrl(`${SHARE_IMAGE_BASE}?${qs.toString()}`);
    setShareLoading(true);
  }

  // 엔드포인트는 CORS * 허용 → blob fetch 가능(클립보드/Web Share/다운로드 공용).
  async function fetchShareBlob(): Promise<Blob | null> {
    if (!shareUrl) return null;
    try {
      const res = await fetch(shareUrl, { mode: "cors" });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  // 모바일/웹뷰 우선 경로: Web Share API(파일 공유) → 실패 시 다운로드 폴백.
  async function shareImage() {
    const blob = await fetchShareBlob();
    if (!blob) { alert("이미지를 길게 눌러 저장해 주세요."); return; }
    const file = new File([blob], "bookchelin.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d?: unknown) => boolean };
    try {
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "북슐랭" });
        return;
      }
    } catch {
      // 사용자가 공유 취소했거나 미지원 → 다운로드로 폴백
    }
    downloadBlob(blob);
  }

  async function saveImage() {
    const blob = await fetchShareBlob();
    if (!blob) { alert("이미지를 길게 눌러 저장해 주세요."); return; }
    downloadBlob(blob);
  }

  function downloadBlob(blob: Blob) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "bookchelin.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
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

      {selectedText && !shareUrl && (
        <div className="epub-share-cta">
          <button type="button" className="epub-share-btn" onClick={openShare}>
            🖼 선택 문장 공유하기
          </button>
        </div>
      )}

      {shareUrl && (
        <div className="epub-share-modal" onClick={() => { setShareUrl(null); setSelectedText(null); }}>
          <div className="epub-share-card" onClick={(e) => e.stopPropagation()}>
            <header className="epub-share-card__head">
              <span>공유 이미지</span>
              <button type="button" onClick={() => { setShareUrl(null); setSelectedText(null); }} aria-label="닫기">✕</button>
            </header>
            <div className="epub-share-card__body">
              {shareLoading && <div className="epub-spinner" />}
              {/* 생성된 이미지만 표시. 모바일에선 이미지를 꾹 눌러 저장/공유. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shareUrl}
                alt="공유 이미지"
                className="epub-share-img"
                style={{ display: shareLoading ? "none" : "block" }}
                onLoad={() => setShareLoading(false)}
                onError={() => setShareLoading(false)}
              />
            </div>
            {!shareLoading && (
              <div className="epub-share-actions">
                <button type="button" className="epub-share-action primary" onClick={shareImage}>공유하기</button>
                <button type="button" className="epub-share-action" onClick={saveImage}>이미지 저장</button>
              </div>
            )}
            <p className="epub-share-hint">버튼이 안 되면 이미지를 길게 눌러 저장하세요</p>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: READER_CSS }} />
    </div>
  );
}

// 공유 이미지 엔드포인트 (wimouniv 헤드리스 next/og). 본문은 길이 캡 + 공백 정규화.
const SHARE_IMAGE_BASE = "https://wimouniv.com/api/share-image";
function capShareText(t: string): string {
  const norm = t.replace(/\s+/g, " ").trim();
  return norm.length > 300 ? norm.slice(0, 299).trimEnd() + "…" : norm;
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

/* 선택 시 하단 공유 CTA (하단 컨트롤 바 위에 떠 있음) */
.epub-share-cta { position: fixed; left: 0; right: 0; bottom: calc(52px + env(safe-area-inset-bottom)); z-index: 10002; display: flex; justify-content: center; pointer-events: none; }
.epub-share-btn { pointer-events: auto; background: #fb3026; color: #fff; border: none; border-radius: 999px; padding: 12px 22px; font-size: 15px; font-weight: 700; box-shadow: 0 4px 16px rgba(251,48,38,0.35); cursor: pointer; }
.epub-share-btn:active { transform: translateY(1px); }

/* 생성된 이미지 모달 */
.epub-share-modal { position: fixed; inset: 0; z-index: 10003; background: rgba(0,0,0,0.72); display: flex; align-items: center; justify-content: center; padding: 20px; }
.epub-share-card { width: min(92vw, 460px); max-height: 90vh; background: #fff; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.epub-root.epub-dark .epub-share-card { background: #1c1c1c; }
.epub-share-card__head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: 600; color: #212121; }
.epub-root.epub-dark .epub-share-card__head { border-bottom-color: #444; color: #e0e0e0; }
.epub-share-card__head button { background: none; border: none; font-size: 16px; cursor: pointer; color: inherit; }
.epub-share-card__body { display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 200px; }
.epub-share-img { width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.18); -webkit-touch-callout: default; }
.epub-share-actions { display: flex; gap: 10px; padding: 0 16px 4px; }
.epub-share-action { flex: 1; padding: 13px 0; border-radius: 10px; border: 1px solid #e0e0e0; background: #fff; color: #212121; font-size: 15px; font-weight: 700; cursor: pointer; }
.epub-share-action.primary { background: #fb3026; border-color: #fb3026; color: #fff; }
.epub-share-action:active { transform: translateY(1px); }
.epub-root.epub-dark .epub-share-action { background: #2a2a2a; border-color: #555; color: #e0e0e0; }
.epub-root.epub-dark .epub-share-action.primary { background: #fb3026; border-color: #fb3026; color: #fff; }
.epub-share-hint { margin: 0; padding: 12px 16px 16px; text-align: center; font-size: 12px; color: #888; }
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

/** The continuous manager's scroll container (the element that owns scrollTop). */
function getScrollContainer(rendition: Rendition): HTMLElement | null {
  const manager = (rendition as unknown as { manager?: { container?: HTMLElement } })
    .manager;
  const container = manager?.container;
  return container && typeof container.scrollTop === "number" ? container : null;
}

/**
 * Pins the reader to the section it is currently looking at. epub.js's continuous
 * manager appends/prepends and resizes sections as you scroll (and on font/margin
 * changes); when a section *above* the viewport changes height the reader would
 * otherwise lurch to a different spot. We remember the top-most visible view and
 * its offset on genuine scrolls, and after any layout change we add the drift
 * back to scrollTop so that view stays put.
 *
 * Recording only happens on "clean" frames (no layout change pending), so epub.js's
 * own programmatic scroll compensation — which always rides along with a resize or
 * DOM mutation — is treated as a layout change to undo, not as a new user position.
 */
function attachScrollAnchorKeeper(container: HTMLElement): () => void {
  let anchor: { el: Element; top: number } | null = null;
  let dirty = false;
  let scrolled = false;
  let rafId = 0;

  const childRectsRelativeToTop = () => {
    const containerTop = container.getBoundingClientRect().top;
    const children = Array.from(container.children);
    const rects = children.map((c) => {
      const r = c.getBoundingClientRect();
      return { top: r.top - containerTop, bottom: r.bottom - containerTop };
    });
    return { children, rects, containerTop };
  };

  const record = () => {
    const { children, rects } = childRectsRelativeToTop();
    const idx = pickAnchorIndex(rects);
    anchor = idx >= 0 ? { el: children[idx], top: rects[idx].top } : null;
  };

  const restore = () => {
    if (!anchor || !anchor.el.isConnected) {
      record();
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const currentTop = anchor.el.getBoundingClientRect().top - containerTop;
    const delta = anchorCorrection(anchor.top, currentTop);
    if (shouldCorrect(delta)) container.scrollTop += delta;
  };

  const tick = () => {
    rafId = 0;
    if (dirty) {
      dirty = false;
      scrolled = false;
      restore();
    } else if (scrolled) {
      scrolled = false;
      record();
    }
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  const onScroll = () => {
    scrolled = true;
    schedule();
  };
  const onLayoutChange = () => {
    dirty = true;
    schedule();
  };

  container.addEventListener("scroll", onScroll, { passive: true });

  const resizeObserver = new ResizeObserver(onLayoutChange);
  const observeChildren = () => {
    for (const child of Array.from(container.children)) resizeObserver.observe(child);
  };
  observeChildren();

  // Sections are added/removed as you scroll; re-observe the new set and re-pin.
  const mutationObserver = new MutationObserver(() => {
    resizeObserver.disconnect();
    observeChildren();
    onLayoutChange();
  });
  mutationObserver.observe(container, { childList: true });

  record();

  return () => {
    container.removeEventListener("scroll", onScroll);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
  };
}
