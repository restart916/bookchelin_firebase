# 레거시 Firebase Hosting → Next.js 전면 이전 계획

작성일: 2026-06-19
상태: 계획 (구현 전)

## 목표

`bookchelin.com`(Next.js App Hosting, backend `bookchelin-web`)이 **모든 웹 라우트**를
서빙하게 만든 뒤, 레거시 classic Firebase Hosting(`bookchelin.web.app` /
`bookchelin.firebaseapp.com`)을 은퇴시킨다. 컷오버는 **마지막에** 기존 경로를
Next.js로 301 리다이렉트하는 방식으로 처리한다.

## 현재 상태

### 이미 Next.js로 이전 완료 (bookchelin.com)
공개 SEO 페이지는 `web_book` Cloud Function에서 Next.js로 사실상 이전 완료:
`/`, `/book/[id]`, `/books`, `/category/[slug]`, `/privacy`,
`/community-guidelines`, `/.well-known/apple-app-site-association`,
`sitemap.ts`, `robots.ts`. 클라이언트/어드민 Firebase SDK 셋업도 존재
(`src/lib/firebase-client.ts`, `firebase-admin.ts`), 테스트는 vitest(`*.test.ts`).

### 아직 레거시 classic hosting에만 남은 것
`firebase.json`의 `hosting` 블록 기준:

1. **`web_book` 함수** — 공개 SSR 페이지. → Next.js가 이미 대체. **중복 상태**(은퇴 대상).
2. **Vue 어드민 SPA** (`/admin/**` → `/admin/index.html`) — Vue 2.6 / vue-cli 3 /
   Firebase web SDK 5, EOL 스택. 라우트(`vue-project/src/router.js`):
   - 어드민: `login`, `/`(ListView), `edit`, `edit-banner`, `edit-main-book`,
     `edit-time-event`, `edit-limit-event`, `edit-suggest-book`, `count`,
     `count-time`, `event-count`, `edit-link-select`, `edit-log-select`,
     `edit-review`, `publisher`, `publisher/detail/:id`, `export`
   - 공개(앱 사용): **`/epub-viewer/:book_id`** (`EpubViewer.vue`, `epubjs ^0.3.88`)
   - 접근 가드: `PUBLIC_ROUTE_NAMES = [LoginView, PublisherLogin,
     EventCountViewByPublisher, EpubViewer]` 외에는 화이트리스트 구글 계정만.
3. **레거시 리다이렉트** — 옛 루트 URL(`/edit`, `/count`, `/publisher`,
   `/epub-viewer/*`, `/publisher/detail/*` 등) → `/admin/...` 301.

### 두 라우트군의 성격 차이 (중요)
- **epub-viewer**: 앱이 쓰는 공개 리더. **iOS(Flutter WebView)만** 소비
  (`book_epub_web_page.dart` → WebView → `bookchelin.com/epub-viewer/{id}`).
  **Android는 epublib로 네이티브 렌더**라 이 라우트를 안 씀. 릴리스 블로커, 범위 작음.
- **admin**: 내부 운영툴. 앱과 무관, 릴리스 블로커 아님, 범위 큼(EOL).

---

## Phase 1 — epub-viewer를 Next.js로 (릴리스 블로커, 지금)

### 보존해야 하는 계약 (절대 깨면 안 됨)
iOS WebView가 의존하는 정확한 인터페이스:

- **URL**: `https://bookchelin.com/epub-viewer/{book_id}?{query}` (iOS는 이미
  `WebLinks.epubViewerUrl`로 이 주소를 봄 — 커밋 `49f91c6`).
- **쿼리 파라미터** (읽기): `cfi`(epubcfi 위치), `fontsize`(정수%), `theme`
  (`normal`/`dark`/`sepia`).
- **데이터 경로**: `books/{book_id}` 문서의 `firestore_url` 필드 → Firebase
  Storage `ref().child(firestore_url).getDownloadURL()` → epubjs `ePub(url)`.
- **렌더**: epubjs `renderTo(target, { width:"100%", flow:"scrolled-doc" })`,
  테마(폰트크기/패딩/폰트패밀리/dark invert).
- **네이티브 브리지**: `window.flutter_webview.postMessage("key:value")` 로 통지.
  키: `fontsize`, `margin`, `theme`, `relocated`(현재 cfi). 채널명 `flutter_webview`
  는 Flutter `book_epub_web_page.dart:47`에서 주입 — **이름/포맷 그대로**.

### 구현
1. `nextjs-web/src/app/epub-viewer/[id]/page.tsx` — **client component**
   (`"use client"`), epubjs는 브라우저 전용이라 `dynamic import`로 클라이언트에서만 로드.
2. 데이터 (**확정: 옵션 A**): 서버 컴포넌트/route handler에서 admin SDK로
   `books/{id}.firestore_url` → Storage download URL을 resolve해 client로 전달.
   클라에 Storage 권한/익명로그인 불필요. (`firebase-admin.ts` 재사용.)
3. epubjs 렌더 + 폰트/테마/마진 컨트롤 UI 포팅(EpubViewer.vue 1:1).
4. `window.flutter_webview` 브리지 헬퍼로 동일 메시지 전송.
5. `relocated` 이벤트에서 cfi 통지(진도 저장), 진입 시 `?cfi`로 위치 복원.
6. **`next.config.ts`의 임시 리다이렉트 제거** (interim 핵 — Phase 1이 대체).

### 검증
- vitest: URL 파라미터 파싱 / 브리지 메시지 포맷 단위테스트.
- iOS 시뮬레이터: 책 상세 → EPUB 열기 → 렌더/페이지이동/폰트·테마 변경/진도 복원 +
  앱쪽 진도·설정 동기화가 기존과 동일한지 회귀 확인.
- 실제 책 id로 `bookchelin.com/epub-viewer/{id}` 직접 로드 확인.

### 산출물 / 영향
- iOS 릴리스 언블록. iOS는 재배포 없이 동작(이미 .com 주소 참조).
- 이후 epub-viewer는 firebaseapp.com 의존 0.

---

## Phase 2 — 어드민을 Next.js로 **재작성** (릴리스와 분리, 나중)

> **확정: 재작성**. Vue 빌드 정적 lift-and-shift는 채택하지 않음. 페이지가 너무
>오래됐고 디자인/컴포넌트가 전부 구식이라, 빌드 결과물을 옮기지 않고 **각 페이지의
> 기능만 파악해 Next.js/React + 현대 컴포넌트로 신규 구현**한다. 기능적으로 동일하게
> 동작하면 됨. 같은 Firestore 데이터를 읽고 같은 쓰기를 수행. 라우트 단위 점진 이전.

### 공통 기반
- 어드민 인증: 화이트리스트 구글 계정(현 Vue 가드와 동일) → Next.js에서 Firebase
  Auth(Google) + 서버측 이메일 화이트리스트 체크. `/admin/*`는 noindex.
- 데이터 쓰기는 Vue가 클라에서 직접 Firestore 쓰던 것을 유지하거나, 가능하면
  서버 액션/route handler(admin SDK)로 이전(규칙 permissive 부채 고려).
- 각 화면 이전 시 vitest + 수동 확인.

### 페이지별 기능·데이터 인벤토리 (재구현 대상)
| Vue 라우트 | 기능 | Firestore 컬렉션/문서 | 쓰기 | 비고 |
|---|---|---|---|---|
| `/`(ListView) | 책 목록 조회 | `books`, `newz` | 읽기 | |
| `edit` | 책 CRUD + 카테고리/출판사 | `books`, `book_category`, `publisher` | add/update/delete | 핵심 |
| `edit-banner` | 배너 관리 | `banners` | add/update/delete | |
| `edit-main-book` | 홈 메인/캐러셀 구성 | `books`, `home_dynamic/current`, `home_carousel_pins` | add/update/delete | 홈 큐레이션 |
| `edit-time-event` | 타임이벤트 편집 | `books`, `time_event` | add/update/delete | 서브컬렉션 규약 주의 |
| `edit-limit-event` | 리밋이벤트 편집 | `books`, `limit_event` | add/update/delete | 〃 |
| `edit-suggest-book` | 추천 그룹 편집 | `books`, `suggest_group` | add/update/delete | |
| `count` | 일별 집계 조회 | `books`, `dayly_total` | 읽기 | |
| `count-time` | 일별 독서시간 집계 | `books`, `dayly_total_time`, `search_index/books` | 읽기 | |
| `event-count` | 이벤트 카운트 | `dayly_event_count`, `limit_event`, `time_event` | add | 부모문서 집계값 사용(순회 금지) |
| `edit-link-select` | 링크셀렉트 관리 | `book_category`, `link_select`, `link_select_click` | add/update/delete | |
| `edit-log-select` | 로그셀렉트 관리 | `book_category`, `log_select`, `log_select_click` | add/update/delete | |
| `edit-review` | 리뷰 모더레이션 | `book_reviews`, `search_index/books` | callable | `adminListReviewReports`, `adminModerateReview` 호출(이미 존재) |
| `publisher`(login) | 출판사 로그인 | `publisher` | 읽기 | 공개 라우트 |
| `publisher/detail/:id` | 출판사별 이벤트 집계 | `books`, `publisher`, `limit_event`, `time_event`, `dayly_event_count` | add | 공개 라우트, 부모집계 사용 |
| `export` | 책 내보내기 | `books` | 읽기 | |

> 데이터 모델 규약은 `bookchelin_firebase/CLAUDE.md` 참조 — 특히 이벤트
> 부모문서의 `user_count`/`total_read_time` 직접 사용(서브컬렉션 `read_history`
> 순회 금지), `search_index/books` 단일문서 shape.

---

## Phase 3 — 레거시 hosting 컷오버 & 은퇴 (마지막)

Next.js가 admin+epub-viewer+public을 모두 커버하면:

1. **기존 경로 → Next.js 301 리다이렉트**로 전환(사용자 지정 방식):
   - 북마크/외부링크 보호 위해 옛 classic-hosting 경로를 bookchelin.com 대응 경로로
     301. (대부분 이미 bookchelin.com이 정식 도메인이라 영향 적음.)
2. **`firebase.json` 정리**:
   - `hosting.rewrites`의 `** → web_book` 제거(공개페이지는 Next.js).
   - `/admin/**` rewrite 제거(어드민은 Next.js).
   - 레거시 redirects 정리.
3. **`web_book` 함수 deprecate** → 트래픽 0 확인 후 제거.
4. **`vue-project` 아카이브/제거** (또는 정적 lift-and-shift 채택 시 그때 정리).
5. classic hosting site는 bookchelin.com으로의 캐치올 301만 남기거나 비활성화.

### 주의
- `sitemap.xml` / `robots` / `apple-app-site-association` 는 Next.js가 이미 제공 —
  web_book 제거 전 동등성 확인.
- Android는 epub-viewer 웹라우트 비의존 → admin/web 은퇴 영향 없음.
- Firestore/Storage 규칙은 현재 permissive(보안 부채) — 별도 과제.

---

## 권장 진행 순서

1. **Phase 1 (epub-viewer) 지금** → iOS 리뷰 릴리스와 함께 출시. 임시 리다이렉트 제거.
2. iOS/Android 리뷰 릴리스 배포(별도 체크리스트).
3. **Phase 2 (admin)** 점진 이전 — 릴리스와 분리.
4. **Phase 3** Next.js 완비 후 레거시 301 컷오버 + 은퇴.

## 결정 완료
- Phase 2 어드민: **재작성**(기능 동일, 신규 구현). lift-and-shift 미채택.
- Phase 1 데이터: **옵션 A**(admin SDK 서버 resolve).
