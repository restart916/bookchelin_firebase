# 북슐랭 Next.js 공개 웹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nextjs-web/`에 검색 유입과 앱 설치 전환을 위한 Next.js 공개 웹을 만들고 Firebase App Hosting 자동 배포 준비를 완료한다.

**Architecture:** Next.js App Router의 Server Components가 Firebase Admin SDK와 App Hosting Application Default Credentials로 Firestore를 읽는다. 브라우저 코드는 검색 상호작용과 Firebase Analytics 이벤트에만 사용하며, 기존 Vue 관리자와 앱 전용 EPUB 뷰어는 현재 Firebase Hosting에 격리해 유지한다.

**Tech Stack:** Next.js 16.2.9, React 19.2.7, TypeScript 6.0.3, Firebase JS SDK 12.15.0, Firebase Admin SDK 14.0.0, Vitest 4.1.9, Firebase App Hosting

## Global Constraints

- 공개 웹에는 사용자 로그인, 대여함, 읽기 기록 동기화, EPUB/PDF 웹 리더를 제공하지 않는다.
- 책 본문은 절대 웹에 노출하지 않고 앱 설치·실행 CTA만 제공한다.
- 기존 `bookchelin.web.app/admin/epub-viewer/{bookId}`는 이동·차단하지 않고 검색 비노출 상태로 유지한다.
- 공개 책은 `hidden !== true`, 숨김 또는 미존재 책 상세는 404다.
- canonical 기준 도메인은 출시 목표인 `https://bookchelin.com`이다.
- Firestore 위치가 `nam5`이므로 App Hosting 기본 리전은 `us-central1`이다.
- 기존 `functions/web_book.js`, Vue 관리자, Firebase Hosting 라우팅은 도메인 전환 전까지 변경하지 않는다.

---

### Task 1: Next.js 프로젝트와 테스트 기반

**Files:**
- Create: `nextjs-web/package.json`
- Create: `nextjs-web/package-lock.json`
- Create: `nextjs-web/tsconfig.json`
- Create: `nextjs-web/next.config.ts`
- Create: `nextjs-web/eslint.config.mjs`
- Create: `nextjs-web/vitest.config.ts`
- Create: `nextjs-web/src/lib/constants.ts`
- Create: `nextjs-web/src/lib/constants.test.ts`

**Interfaces:**
- Produces: `SITE_URL`, `CATEGORY_BY_ID`, `CATEGORY_BY_SLUG`, `IOS_STORE_URL`, `ANDROID_STORE_URL`

- [ ] **Step 1: Scaffold the pinned Next.js project**

Run `npx create-next-app@16.2.9 nextjs-web --ts --eslint --app --src-dir --use-npm --no-tailwind --import-alias '@/*' --yes`, then set package scripts to `dev`, `build`, `start`, `lint`, `typecheck`, and `test`.

- [ ] **Step 2: Write a failing constants test**

Assert that all six category IDs round-trip through slug lookup and that `SITE_URL === "https://bookchelin.com"`.

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `cd nextjs-web && npm test -- src/lib/constants.test.ts`
Expected: FAIL because the constants module is missing.

- [ ] **Step 4: Implement constants and Vitest configuration**

Use slugs `knowledge`, `growth`, `career`, `kids`, `literature`, `business` for IDs `1` through `6`; use iOS app ID `1544648278` and Android package `com.bookchelin.bookchelin`.

- [ ] **Step 5: Run tests and commit**

Run: `cd nextjs-web && npm test && npm run typecheck`
Expected: all tests pass and TypeScript exits 0.

Commit: `feat(web): scaffold Next.js public app`

### Task 2: Firestore server repository and pure model mapping

**Files:**
- Create: `nextjs-web/src/lib/firebase-admin.ts`
- Create: `nextjs-web/src/lib/books.ts`
- Create: `nextjs-web/src/lib/books.test.ts`
- Create: `nextjs-web/src/lib/types.ts`

**Interfaces:**
- Produces: `BookSummary`, `BookDetail`, `BookReviewSummary`
- Produces: `mapBook(id, data)`, `summarizeReviews(rows)`, `getVisibleBooks()`, `getVisibleBook(id)`, `getBookReviews(id)`, `getHomeData()`

- [ ] **Step 1: Write failing mapper tests**

Cover string normalization, missing optional fields, `hidden: true` rejection, review `hide === "1"` exclusion, rating average rounding, and five-review display cap.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd nextjs-web && npm test -- src/lib/books.test.ts`
Expected: FAIL because mapping functions do not exist.

- [ ] **Step 3: Implement typed pure mappers**

The public model contains only ID, title, description, TOC, image URL, category, publisher, and store links. Do not include `firestore_url` or any EPUB/PDF content URL.

- [ ] **Step 4: Implement server-only Firebase Admin access**

Initialize once with `getApps()` and `applicationDefault()`. Query visible books, one book, reviews, `home_dynamic/current`, and non-auto `suggest_group` documents. Apply `unstable_cache` with tags and 10-minute or 1-hour revalidation according to page freshness.

- [ ] **Step 5: Run tests, lint, typecheck and commit**

Run: `cd nextjs-web && npm test && npm run lint && npm run typecheck`
Expected: all commands exit 0.

Commit: `feat(web): add Firestore server repository`

### Task 3: Brand shell and Firebase Analytics

**Files:**
- Modify: `nextjs-web/src/app/layout.tsx`
- Modify: `nextjs-web/src/app/globals.css`
- Create: `nextjs-web/src/components/site-header.tsx`
- Create: `nextjs-web/src/components/site-footer.tsx`
- Create: `nextjs-web/src/components/book-card.tsx`
- Create: `nextjs-web/src/components/store-cta.tsx`
- Create: `nextjs-web/src/components/analytics-provider.tsx`
- Create: `nextjs-web/src/lib/firebase-client.ts`
- Create: `nextjs-web/src/lib/analytics.ts`
- Create: `nextjs-web/src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `trackEvent(name, params)`, `BookCard`, `StoreCta`

- [ ] **Step 1: Write failing analytics payload tests**

Assert that `app_install_click` receives `platform`, `placement`, optional `book_id`, and `source`, and that undefined values are removed before logging.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd nextjs-web && npm test -- src/lib/analytics.test.ts`
Expected: FAIL because analytics helpers are missing.

- [ ] **Step 3: Implement browser-safe Firebase initialization**

Use the supplied Firebase Web config through `NEXT_PUBLIC_FIREBASE_*`; initialize Analytics only when `window` exists and `isSupported()` resolves true. Measurement ID is `G-XCM430STF8`.

- [ ] **Step 4: Build the responsive brand shell**

Use semantic HTML, accessible focus states, responsive book grids, the existing pink brand accent, and no login or reader navigation. `StoreCta` logs install/open events before navigating.

- [ ] **Step 5: Run tests and commit**

Run: `cd nextjs-web && npm test && npm run lint && npm run typecheck`
Expected: all commands exit 0.

Commit: `feat(web): add public shell and analytics`

### Task 4: Home, catalog search, and category pages

**Files:**
- Modify: `nextjs-web/src/app/page.tsx`
- Create: `nextjs-web/src/app/books/page.tsx`
- Create: `nextjs-web/src/app/category/[slug]/page.tsx`
- Create: `nextjs-web/src/components/book-search.tsx`
- Create: `nextjs-web/src/lib/search.ts`
- Create: `nextjs-web/src/lib/search.test.ts`

**Interfaces:**
- Consumes: repository and shared components from Tasks 2–3
- Produces: `normalizeSearchText`, `filterBooks`

- [ ] **Step 1: Write failing search tests**

Cover Korean title matching, description matching, case-insensitive Latin matching, whitespace normalization, empty query returning all books, and result count.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd nextjs-web && npm test -- src/lib/search.test.ts`
Expected: FAIL because search helpers are missing.

- [ ] **Step 3: Implement home and catalog**

Home renders current carousel, trending, discover, category entry cards, FAQ structured data, and store CTA. `/books?q=` renders all visible books and enhances filtering client-side while logging `search` and `select_book`.

- [ ] **Step 4: Implement category pages**

Validate slugs through `CATEGORY_BY_SLUG`, return `notFound()` for invalid slugs, create static params for six categories, and generate category-specific metadata and internal links.

- [ ] **Step 5: Run tests/build and commit**

Run: `cd nextjs-web && npm test && npm run lint && npm run typecheck && npm run build`
Expected: all commands exit 0 and routes `/`, `/books`, `/category/[slug]` appear in build output.

Commit: `feat(web): add searchable catalog pages`

### Task 5: Book detail, privacy, SEO files, and app-only viewer isolation

**Files:**
- Create: `nextjs-web/src/app/book/[id]/page.tsx`
- Create: `nextjs-web/src/app/privacy/page.tsx`
- Create: `nextjs-web/src/app/not-found.tsx`
- Create: `nextjs-web/src/app/sitemap.ts`
- Create: `nextjs-web/src/app/robots.ts`
- Create: `nextjs-web/public/.well-known/assetlinks.json`
- Create: `nextjs-web/public/.well-known/apple-app-site-association`
- Create: `nextjs-web/src/lib/seo.ts`
- Create: `nextjs-web/src/lib/seo.test.ts`

**Interfaces:**
- Produces: `buildBookJsonLd(book, reviews)`, `buildBreadcrumbJsonLd(book)`

- [ ] **Step 1: Write failing SEO tests**

Assert canonical `https://bookchelin.com/book/{id}`, no full-text/storage URL leakage, optional aggregate rating, correct breadcrumb, and sitemap exclusion of hidden books.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd nextjs-web && npm test -- src/lib/seo.test.ts`
Expected: FAIL because SEO helpers are missing.

- [ ] **Step 3: Implement book detail and privacy**

Use `generateMetadata`, `notFound()`, JSON-LD script tags, review summaries, and app CTAs. Port the existing privacy content without adding login or reader routes.

- [ ] **Step 4: Implement sitemap, robots, and association files**

Sitemap contains home, books, six category pages, privacy, and every visible book. Robots allows public routes and disallows `/admin/` and `/epub-viewer/`. Copy the existing association files unchanged pending mobile-domain release.

- [ ] **Step 5: Verify no public viewer implementation exists**

Run: `rg -n "epub|pdf|firestore_url" nextjs-web/src nextjs-web/public`
Expected: only robots exclusion or explanatory comments; no viewer route or content URL rendering.

- [ ] **Step 6: Run full verification and commit**

Run: `cd nextjs-web && npm test && npm run lint && npm run typecheck && npm run build`
Expected: all commands exit 0.

Commit: `feat(web): add book SEO and policy pages`

### Task 6: App Hosting configuration and automatic rollout setup

**Files:**
- Create: `nextjs-web/apphosting.yaml`
- Create: `nextjs-web/.env.example`
- Create: `nextjs-web/README.md`
- Modify: `.gitignore`

**Interfaces:**
- App root: `nextjs-web`
- Backend name: `bookchelin-web`
- Project: `bookchelin`
- Primary region: `us-central1`
- Live branch: `master`

- [ ] **Step 1: Add App Hosting runtime and public Firebase config**

Set `minInstances: 0`, `maxInstances: 10`, `concurrency: 80`, `cpu: 1`, `memoryMiB: 512`. Add all supplied `NEXT_PUBLIC_FIREBASE_*` values and `NEXT_PUBLIC_SITE_URL=https://bookchelin.com` with `BUILD` and `RUNTIME` availability.

- [ ] **Step 2: Document local and production workflows**

Document ADC setup, `npm run dev`, full verification, backend creation, GitHub automatic rollout, Route 53 connection, and the fact that `/admin/epub-viewer` remains on the legacy Hosting site.

- [ ] **Step 3: Run local production verification**

Run: `cd nextjs-web && npm ci && npm test && npm run lint && npm run typecheck && npm run build`
Expected: all commands exit 0.

- [ ] **Step 4: Create the App Hosting backend**

Run with Node stable:

`firebase apphosting:backends:create --project bookchelin --backend bookchelin-web --primary-region us-central1 --root-dir nextjs-web --app 1:658686940034:web:2a08fc1241723df936359b`

If the CLI requires GitHub authorization or live-branch selection that it cannot complete non-interactively, stop after backend creation and provide the exact Firebase Console path: App Hosting → `bookchelin-web` → Settings → Deployment → connect `restart916/bookchelin_firebase`, root `nextjs-web`, live branch `master`, automatic rollouts on.

- [ ] **Step 5: Commit deployment configuration**

Commit: `chore(web): configure Firebase App Hosting`

### Task 7: Final parity and live smoke verification

**Files:**
- Modify only files required by failures found in this task

- [ ] **Step 1: Compare route parity**

Confirm new `/`, `/book/{knownVisibleId}`, `/privacy`, `/sitemap.xml`, `/robots.txt`, `/books`, and all six categories respond locally; confirm hidden and unknown IDs return 404.

- [ ] **Step 2: Validate SEO output**

Parse sitemap XML, inspect canonical URLs, parse JSON-LD, verify no `noindex` on public pages, and verify no book content URL appears.

- [ ] **Step 3: Verify Analytics configuration**

Confirm the production client bundle contains measurement ID `G-XCM430STF8` and that the event names are exactly `view_book`, `search`, `select_book`, `app_install_click`, `open_app_click`.

- [ ] **Step 4: Run complete fresh verification**

Run: `cd nextjs-web && npm test && npm run lint && npm run typecheck && npm run build`
Expected: zero test failures, lint errors, type errors, or build errors.

- [ ] **Step 5: Inspect Git scope**

Run: `git status --short && git diff --check && git log --oneline -8`.
Expected: only the user-owned `AGENTS.md` and older cost-reduction plan remain untracked; all Next.js work is committed.

