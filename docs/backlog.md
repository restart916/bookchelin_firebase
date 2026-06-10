# 작업 백로그 (pending tasks)

다른 세션에서 이어받을 수 있도록 보류된 작업을 기록한다. 각 항목은 단독으로 실행 가능하도록
배경·범위·주의사항을 포함한다. 완료하면 이 파일에서 해당 항목을 제거(또는 "완료" 표시)할 것.

마지막 갱신: 2026-06-10

---

## 1. 어드민 로그인 게이트 + Firestore 규칙 잠그기 (보안, 우선순위 높음)

### 배경
- `https://bookchelin.web.app/admin/` 에 Vue 2 어드민이 **인증 없이 공개**되어 있다
  (현재 `noindex` 메타만 적용, 소스는 `vue-project/`, `publicPath: '/admin/'`).
- `firestore.rules` 가 **모든 컬렉션 read/write 허용** 상태 — `CLAUDE.md` 에 known security debt 로 명시.
- HTTPS 함수 엔드포인트(`get_limit_events`, `get_limit_events_asia`, `date`, `addMessage`, `test`)도
  공개 상태.

### 할 일
1. **어드민 로그인 게이트** — `vue-project` 에 Firebase Auth 로그인 추가
   (이메일 화이트리스트 방식). Firebase web SDK 5 구버전 주의 — `vue-project/src/main.js` 에서
   초기화 방식 확인.
   - ⚠️ **예외**: `/admin/publisher` 와 `/admin/publisher/detail/:publisher_id` 두 라우트는
     외부 CP(출판사) 제공용이라 **관리자 로그인 없이 접근 가능해야 한다**
     (출판사 코드 입력 방식 유지 — `vue-project/src/views/PublisherLogin.vue` 참고).
     라우터 가드에서 이 두 라우트만 통과시킬 것.
2. **Firestore 규칙 단계적 잠금** — 모바일 클라이언트
   (`../bookchelin_android` Java, `../bookchelin_flutter` Dart)가 비인증으로 직접 쓰는
   로그성 컬렉션(`read_time_logs`, `read_logs`, `book_reviews`, `show_book_detail`,
   `show_book_reader`, `home_section_view`, `home_section_click`,
   `click_buy_book_detail`, `click_share_book_detail` 등)은 **create 만 허용**,
   핵심 데이터(`books`, `banners`, `main_books`, `home_dynamic`, `limit_event`,
   `time_event`, `publisher`, `book_category`)는 **클라이언트 쓰기 차단**.
   (Cloud Functions admin SDK 는 rules 영향을 받지 않으므로 서버 쓰기는 그대로 동작.)
   - CP 통계 페이지(`EventCountViewByPublisher`)가 비인증으로 **읽는** 컬렉션의 read 권한은 유지.
   - **반드시** 양쪽 클라이언트 코드에서 각 컬렉션의 read/write 패턴을 grep 으로 먼저 확인하고
     규칙을 짤 것. 잘못 잠그면 앱의 로그 기록/리뷰 작성이 깨진다.
3. **HTTPS 함수 엔드포인트** 공개 여부 — 외부 제공 중인지 사용자에게 확인 후
   불필요하면 잠금/제거 검토 (`functions/index.js`).
4. **검증 후 배포** — firebase emulators 또는 rules 단위 테스트로 검증.
   배포는 `firebase deploy --only firestore:rules`.

### 주의
- `CLAUDE.md` 규칙: rules 는 콘솔에서 수정 금지, **git 을 통해서만**.
- `firestore.indexes.json` deploy 시 기존 인덱스 삭제 제안에는 **항상 No**.
- Vue 빌드는 Node 20+ 필요(`nvm use stable`), `npm install` 은 `--ignore-scripts`.

---

## 2. 외부 핫링크 표지를 Firebase Storage 로 이전 (안정성)

### 배경
- `books` 컬렉션(692권) `image_url` 이 전부 **외부 핫링크**다:
  - `postfiles.pstatic.net` 22권 (네이버 블로그 — **Referer 차단 이슈 있었음**, 가장 취약)
  - `image.yes24.com` 195권
  - `contents.kyobobook.co.kr` 470권
- 외부 정책 변경 시 앱/웹 표지가 일괄 깨질 위험. (2026-06-10 네이버 표지가 웹에서 깨져서
  `referrerpolicy="no-referrer"` 로 임시 우회한 상태 — `functions/web_book.js`.)

### 할 일
1. `scripts/` 에 마이그레이션 스크립트 작성 (패턴은 `scripts/upload_gongu_books.js` 참고,
   서비스 계정 키 `scripts/bookchelin-firebase-adminsdk-*.json`).
2. 각 책 `image_url` 이미지 다운로드(**네이버는 Referer 헤더 없이** 요청해야 200)
   → Storage `cover/{bookId}.jpg` 업로드 → `firebaseStorageDownloadTokens` 메타데이터로
   토큰 URL 생성 → `books` 문서 `image_url` 교체.
3. 우선순위: `postfiles.pstatic.net` 22권 먼저, 검증 후 yes24/교보 순차 진행.
4. 멱등하게(이미 `firebasestorage.googleapis.com` 인 책은 건너뜀),
   원본 URL 은 `image_url_original` 필드로 백업.
5. 완료 후 `scripts/verify-book-images.mjs` 로 전체 검증.

### 주의
- `image_url` 변경은 search_index 트리거와 무관하고, 클라이언트는 URL 문자열만 로드하므로
  앱 호환성 문제 없음.
- Storage 버킷은 `bookchelin.appspot.com`.

---

## 참고: 후속(별도 결정 필요) 항목

- **커스텀 도메인 구입 검토** — SEO 색인이 본격적으로 쌓이기 전(지금)이 이전 비용이 가장 쌈.
  web.app 도 색인은 정상. 살 경우 Firebase Hosting 커스텀 도메인 연결 +
  `functions/web_book.js` 의 `WEB_BASE_URL` 변경 + web.app→새 도메인 301.
- **Search Console** — `googlefd93372c237fdf45.html` 로 URL 접두어 속성 인증 완료 예정,
  `sitemap.xml` 제출 후 1~2주 뒤 실적 확인.
- **만료저작물 책 추가** — 다음 배치 후보 봄봄·배따라기 등. `docs/public-domain-books.md` 참고.
