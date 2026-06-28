# Phase 2 이어가기 핸드오프 (어드민 → Next.js 재작성)

작성일: 2026-06-19
대상: Claude Code 새 세션에서 남은 어드민 화면 이식을 이어서 진행

상위 계획은 `docs/superpowers/plans/2026-06-19-legacy-hosting-to-nextjs.md` 참고.

---

## 0. 현재 상태

### 배포/커밋
- **Phase 1 (epub-viewer)**: 커밋 `50f75f0` 완료. **단, App Hosting 배포(롤아웃) 아직.**
  - 검증: 배포 후 `curl -sI "https://bookchelin.com/epub-viewer/{bookId}"` 가
    **307(→firebaseapp.com)이 아니라 200** 이면 성공. 현재는 이전 빌드(리다이렉트)가 라이브.
- **Phase 2 기반 + 책 관리/내보내기**: 코드 작성·타입체크·lint 완료, **아직 미커밋**.
  먼저 저장하세요:
  ```bash
  cd ~/Code/bookchelin_firebase
  rm -f .git/index.lock .git/HEAD.lock
  git add nextjs-web/src/app/admin nextjs-web/src/components/admin \
          nextjs-web/src/lib/admin-auth.ts nextjs-web/src/lib/admin-db.ts \
          nextjs-web/src/lib/admin-nav.ts nextjs-web/src/lib/firebase-client.ts
  git commit -m "feat(admin): Next.js admin foundation + 책 관리/내보내기 (Phase 2 시작)"
  ```
- 혹시 `nextjs-web/tmp/` 디렉터리가 있으면 빌드 잔여물이니 삭제: `rm -rf nextjs-web/tmp`

### 완료된 화면 (2/13)
- `/admin/edit` — 책 관리 (EditView.vue 이식 완료)
- `/admin/export` — 책 내보내기 (BookExport.vue + CSV)

### 남은 화면 (11) — 대시보드/이 문서 순서대로
edit-banner → edit-main-book → edit-suggest-book → edit-link-select →
edit-log-select → edit-time-event → edit-limit-event → event-count →
count → count-time → edit-review

작업 위치: `nextjs-web/` (이게 bookchelin.com = App Hosting backend). Vue 원본: `vue-project/src/views/`.

---

## 1. 확립된 패턴 / 규칙 (그대로 따를 것)

### 인증 / 레이아웃
- 모든 어드민 라우트는 `app/admin/` 아래. 레이아웃 `app/admin/layout.tsx`가
  noindex + 풀스크린 셸 + 사이드바(`lib/admin-nav.ts` 기반) + `<AdminGate>` 제공.
- `AdminGate`(`components/admin/admin-gate.tsx`)가 구글 로그인 + 화이트리스트
  (`lib/admin-auth.ts` `ADMIN_EMAILS`) 게이트. 개별 페이지는 인증 신경 안 써도 됨.
- 새 화면 만들면 `lib/admin-nav.ts`에서 해당 섹션 `ready: false → true`로 바꿔
  사이드바/대시보드에 활성화.

### 데이터 접근 (client-side, Vue와 동일 모델)
`lib/admin-db.ts` 헬퍼만 쓰면 됨 (firebase 모듈 SDK 동적 import 래핑):
- `listDocs(path, { field, dir })` → `DocRow[]` (각 row `{id, ...data}`;
  **data 필드가 doc id를 덮어씀** — book_category처럼 자체 `id` 필드 있는 경우 주의)
- `getDocById(path, id)`, `addDocTo(path, data)→id`, `updateDocAt(path,id,data)`,
  `setDocAt(path,id,data,merge?)`, `deleteDocAt(path,id)`, `uploadToStorage(path, file)`
- `asString(v)`, `asNumber(v, fallback?)` — 폼 입력 변환
- 더 필요한 firebase 기능은 `lib/firebase-client.ts`의 `getFirebaseDb/Auth/Storage/App` 사용.
- **보안**: Firestore 규칙이 현재 permissive(별도 부채). client 직접 쓰기는 Vue와 동일하게 의도된 것.

### 페이지 작성 형식
- 파일: `app/admin/<route>/page.tsx`, 최상단 `"use client";`
- 래퍼: `<div className="admin-content"> <h1>제목</h1> <p className="admin-sub">…</p> … </div>`
- 공용 CSS 클래스 재사용(레이아웃 `ADMIN_CSS`에 정의됨):
  `.ad-filters .ad-primary .ad-danger .ad-form .ad-form__head .ad-hint .ad-field
   .ad-row .ad-table .ad-badge(.--active/.--hidden) .ad-pager`
  새 스타일 필요하면 `app/admin/layout.tsx`의 `ADMIN_CSS` 문자열에 추가.

### Lint/타입 주의 (eslint-config-next + react-hooks 최신 룰)
- **effect 안에서 직접 setState 금지** (`react-hooks/set-state-in-effect`).
  데이터 로드는 effect 안 async IIFE + `active` 플래그로:
  ```tsx
  useEffect(() => {
    let active = true;
    (async () => { const x = await listDocs(...); if (!active) return; setX(x); })();
    return () => { active = false; };
  }, []);
  ```
- 필터/페이지 초기화는 effect 말고 **onChange 핸들러에서** `setCurrentPage(1)`.
- `<img>` 쓰면 위에 `{/* eslint-disable-next-line @next/next/no-img-element */}`.
- `any` 금지 — `unknown` + 좁히기 또는 최소 인터페이스.
- 검증(매 화면): `npm run typecheck` + `npx eslint src/app/admin/<route>`.
  전체 `next build`는 샌드박스에선 막히지만 Mac에선 `npm run build`로 확인 가능.

---

## 2. 남은 화면별 스펙 (Vue 원본 읽고 1:1 이식)

각 항목: 라우트 · Vue 원본 · 읽는 컬렉션 · 쓰기 · 핵심 동작. 정확한 필드/폼은
원본 `vue-project/src/views/<File>.vue`를 읽어 그대로 맞출 것.

1. **/admin/edit-banner** — `EditBannerView.vue` (200줄)
   - 컬렉션 `banners`. add/update/delete. 배너 목록 + 생성/수정/삭제 폼(이미지/링크/순서 등 원본 필드 확인).

2. **/admin/edit-main-book** — `EditMainBookView.vue` (391줄, 큼)
   - `books`(참조), `home_dynamic/current`(doc), `home_carousel_pins`. add/update/delete.
   - 홈 메인북·캐러셀 핀 구성. home_dynamic/current 문서 shape 주의(상위 계획/CLAUDE.md 참고).

3. **/admin/edit-suggest-book** — `EditSuggestBookView.vue` (179줄)
   - `books`(참조), `suggest_group`. add/update/delete. 추천 그룹별 book_id 목록 편집.

4. **/admin/edit-link-select** — `EditLinkSelectView.vue` (278줄)
   - `book_category`, `link_select`, `link_select_click`. add/update/delete.

5. **/admin/edit-log-select** — `EditLogSelectView.vue` (225줄)
   - `book_category`, `log_select`, `log_select_click`. add/update/delete. (link-select와 거의 동일 구조)

6. **/admin/edit-time-event** — `EditTimeEventView.vue` (183줄)
   - `books`(참조), `time_event`. add/update/delete.
   - **이벤트 서브컬렉션 규약 주의**: 부모 doc의 `user_count`/`total_read_time` 직접 사용,
     `read_history` 배열로 다시 쓰지 말 것. `has_subcollection_history` 마커 없는 doc 생성 금지.
     (firebase `CLAUDE.md` "limit_event/time_event subcollection" 절 필독)

7. **/admin/edit-limit-event** — `EditLimitEventView.vue` (228줄)
   - `books`(참조), `limit_event`. add/update/delete. 위 6번과 동일 규약 주의.

8. **/admin/event-count** — `EventCountView.vue` (191줄)
   - `dayly_event_count`, `limit_event`, `time_event`. add(집계 기록).
   - **부모 doc 집계값(user_count/total_read_time)만 읽기, read_history 순회 금지.**

9. **/admin/count** — `CountView.vue` (90줄, 읽기 전용)
   - `books`, `dayly_total`. 일별 집계 표시.

10. **/admin/count-time** — `CountTimeView.vue` (292줄)
    - `books`, `dayly_total_time`, `search_index/books`(doc). 독서시간 집계.

11. **/admin/edit-review** — `EditReviewView.vue` (146줄)
    - `book_reviews`, `search_index/books`(doc). **Cloud Function 호출**:
      `adminListReviewReports`, `adminModerateReview` (이미 배포됨).
    - functions 호출은 `firebase/functions` `getFunctions(app)` + `httpsCallable`
      (기본 region us-central1, 다른 onCall 리뷰 함수와 동일). `getFirebaseApp()` 재사용.
    - 신고 큐 표시 + 숨김/복원 모더레이션.

> 공개 라우트였던 `publisher` / `publisher/detail/:id` 는 외부 CP사용. 이번 13개에
> 미포함(대시보드에도 없음). 필요 시 별도로. epub-viewer는 Phase 1에서 완료.

---

## 3. 진행 절차 (각 화면 반복)

1. `vue-project/src/views/<File>.vue` 읽기 → 필드/동작 파악.
2. `app/admin/<route>/page.tsx` 작성 (`"use client"`, 위 패턴/CSS 재사용, admin-db 헬퍼).
3. 필요 시 `app/admin/layout.tsx` `ADMIN_CSS`에 스타일 추가.
4. `lib/admin-nav.ts`에서 해당 섹션 `ready: true`.
5. `npm run typecheck` + `npx eslint src/app/admin/<route>` 클린 확인.
6. 다음 화면으로. 몇 개 단위로 커밋 권장.

## 4. 마지막 (전부 끝난 뒤 = Phase 3, 별도)
- App Hosting 배포 후 `/admin/*` 동작 확인.
- 그다음에야 레거시 classic hosting 은퇴: `firebase.json`의 `/admin/**`·`**→web_book`
  rewrite 정리, 기존 경로 → bookchelin.com 301, `web_book`/`vue-project` 제거.
  (상위 계획 Phase 3 참고. 지금은 건드리지 말 것.)
