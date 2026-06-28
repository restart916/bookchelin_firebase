# EPUB TOC Scroll Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected EPUB chapter anchored after a TOC jump while preserving downward continuous loading and bounded epub.js view memory.

**Architecture:** Add a small guard around epub.js continuous-manager preload settings. A TOC jump temporarily sets the manager offset to zero, then restores the original offset once the reader has moved far enough down that prepending cannot alter the selected chapter's anchor. The React reader owns the guard lifecycle and disables browser scroll anchoring because epub.js already performs explicit height compensation.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, epub.js 0.3.93, Vitest 4

## Global Constraints

- Keep `manager: "continuous"` and `flow: "scrolled"`.
- Do not patch or fork epub.js.
- Preserve the Flutter `flutter_webview` bridge message contract.
- Preserve epub.js cleanup of offscreen views.

---

### Task 1: Continuous-manager TOC preload guard

**Files:**
- Create: `nextjs-web/src/lib/epub-toc-navigation.ts`
- Create: `nextjs-web/src/lib/epub-toc-navigation.test.ts`

**Interfaces:**
- Consumes: an epub.js-like manager with `settings.offset` and `container.scrollTop`.
- Produces: `TocPreloadGuard` with `begin()`, `finish()`, `cancel()`, and `destroy()`.

- [ ] **Step 1: Write failing guard tests**

Test that `begin()` stores offset `500` and sets it to `0`; `finish()` keeps suppression near the top; a later container scroll at `500` restores it; `cancel()` and `destroy()` always restore it.

- [ ] **Step 2: Verify RED**

Run: `cd nextjs-web && npm test -- src/lib/epub-toc-navigation.test.ts`

Expected: FAIL because `./epub-toc-navigation` does not exist.

- [ ] **Step 3: Implement the guard**

Create a focused class that attaches one passive scroll listener, ignores programmatic scroll events while `begin()`/`finish()` navigation is active, and restores the saved offset when `scrollTop >= savedOffset`.

- [ ] **Step 4: Verify GREEN**

Run: `cd nextjs-web && npm test -- src/lib/epub-toc-navigation.test.ts`

Expected: all guard tests pass.

### Task 2: Reader integration and layout stabilization

**Files:**
- Modify: `nextjs-web/src/app/epub-viewer/[id]/EpubReader.tsx`

**Interfaces:**
- Consumes: `TocPreloadGuard` from Task 1.
- Produces: guarded asynchronous `openChapter(item: NavItem): Promise<void>` behavior.

- [ ] **Step 1: Add a failing source-level integration test**

Extend `nextjs-web/src/lib/epub-toc-navigation.test.ts` to verify an exported `runGuardedTocDisplay(guard, display)` calls `begin → display → finish`, and calls `cancel` when display rejects.

- [ ] **Step 2: Verify RED**

Run: `cd nextjs-web && npm test -- src/lib/epub-toc-navigation.test.ts`

Expected: FAIL because `runGuardedTocDisplay` is not exported.

- [ ] **Step 3: Implement guarded display and integrate it**

Create the guard after `book.renderTo`, destroy it during effect cleanup, make `openChapter` await the display with a synchronous ref lock, remove font/margin reapplication from `relocated`, and add `.epub-container { overflow-anchor: none; }` to reader CSS.

- [ ] **Step 4: Verify GREEN and full project checks**

Run:

```bash
cd nextjs-web
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0.

### Task 3: Browser regression verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: production build served locally with the existing Firebase-backed route.
- Produces: recorded scroll metrics demonstrating the selected chapter remains anchored.

- [ ] **Step 1: Start the built application locally**

Run: `cd nextjs-web && npm run start`.

- [ ] **Step 2: Open the known EPUB and select a middle TOC item**

Use `/epub-viewer/UBjjM3DtdECUy8sReA7Q`, choose `희망과 절망 사이`, and inspect `.epub-container` plus `.epub-view` metrics.

- [ ] **Step 3: Verify continuous downward loading and bounded views**

Confirm that the previous section is not prepended during the TOC display, downward scrolling appends following sections, and distant iframe contents are destroyed by epub.js trimming.
