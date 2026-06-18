# 북슐랭 Next.js 공개 웹 설계

## 목표

검색으로 책과 북슐랭을 발견한 사용자가 책 정보를 탐색하고 App Store 또는 Google Play 설치로 전환되도록 한다. 기존 Vue 2 관리자는 `/admin` 용도로 유지하고, 공개 웹만 `nextjs-web/`의 Next.js 앱과 Firebase App Hosting으로 이전한다.

## 1차 출시 범위

- `/`: 서비스 소개, 현재 홈 큐레이션, 카테고리 진입, 앱 설치 CTA
- `/books`: 제목·소개 검색과 전체 공개 책 탐색
- `/category/[slug]`: 문학, 지식교양, 경제경영, 자기계발, 키즈, 취업수험별 목록
- `/book/[id]`: 표지, 소개, 목차, 평점·리뷰, 구조화 데이터, 앱 설치 CTA
- `/privacy`: 기존 개인정보 처리방침 이전
- `/sitemap.xml`, `/robots.txt`: `bookchelin.com` 기준 동적 생성
- 404 및 숨김 책 차단

책 본문은 웹에 노출하지 않는다. 읽기는 앱 설치·실행으로 연결한다.

공개 웹에는 사용자 로그인, 대여함, 읽기 기록 동기화, EPUB/PDF 웹 리더를 제공하지 않는다. 광고 수익 구조상 실제 독서는 앱에서만 제공한다.

## 기술 구조

- Next.js App Router + TypeScript
- Server Components에서 Firebase Admin SDK와 Application Default Credentials로 Firestore 조회
- Client Component는 검색 상호작용과 Firebase Analytics 이벤트에만 사용
- 공개 Firebase Web 설정은 `NEXT_PUBLIC_*` 환경 변수로 관리
- App Hosting 런타임 설정은 `nextjs-web/apphosting.yaml`에 둔다
- Firestore 모델 변환과 선정 로직은 UI와 분리해 단위 테스트한다

기존 `functions/web_book.js`는 새 사이트가 검증되고 도메인이 전환될 때까지 유지한다. Vue 프로젝트와 기존 Firebase Hosting 배포도 이 단계에서는 변경하지 않는다.

## 데이터와 캐시

- 공개 책 조건: `hidden !== true`
- 책 상세는 문서 ID로 조회하고 숨김·미존재는 404 처리
- 리뷰는 기존 규약대로 `hide === "1"` 제외
- 홈 큐레이션은 `home_dynamic/current`, 하단 기획전은 `suggest_group` 사용
- 카탈로그·카테고리·사이트맵은 Next.js 서버 캐시를 사용하되 재검증 주기를 둔다
- 책 변경 직후 즉시 무효화하는 웹훅은 1차 범위에서 제외하고 짧은 재검증으로 운영한다

## SEO

- 모든 공개 페이지에 canonical, title, description, Open Graph 적용
- 홈: `WebSite`, `MobileApplication`, `FAQPage`
- 책: `Book`, `BreadcrumbList`, 평점이 있을 때만 `AggregateRating`
- 카테고리·검색 결과에 내부 링크 제공
- 기존 `/book/{id}` 경로를 그대로 유지해 도메인 이전 시 경로 손실을 막는다
- App Hosting 검증 후 `bookchelin.com`을 canonical로 전환하고, 기존 `bookchelin.web.app/*`는 동일 경로로 301한다

## Analytics와 설치 전환

Firebase Analytics 측정 ID `G-XCM430STF8`을 사용한다.

주요 이벤트:

- `view_book`: `book_id`, `category`, `source`
- `search`: `search_term`, `result_count`
- `select_book`: `book_id`, `source`, `position`
- `app_install_click`: `platform`, `book_id`, `placement`, `source`
- `open_app_click`: `platform`, `book_id`, `placement`

앱스토어 링크에는 캠페인 파라미터를 붙이고, GA4에서 `app_install_click`을 전환 이벤트로 지정할 수 있게 한다. 실제 설치 완료와 웹 세션의 완전한 연결은 스토어 측 어트리뷰션 제약이 있으므로 1차 지표는 스토어 이동 클릭이다.

## 도메인과 앱 딥링크

- 주 도메인: `bookchelin.com`
- `www.bookchelin.com`은 주 도메인으로 리다이렉트
- 기존 관리자: `https://bookchelin.web.app/admin/` 유지
- `.well-known/assetlinks.json`과 `apple-app-site-association`을 새 웹에도 제공
- Android App Links와 iOS Universal Links가 `bookchelin.com`을 직접 열려면 두 모바일 앱의 도메인 설정과 재배포가 필요하다. 웹 출시와 별도 후속 작업으로 명시한다
- 기존 `bookchelin.web.app/admin/epub-viewer/{bookId}`는 Flutter 앱이 사용하는 앱 전용 WebView이므로 Next.js에 이관하거나 공개 링크를 만들지 않는다
- 기존 뷰어는 관리자 SPA 전체의 `noindex,nofollow` 아래에 유지한다. 외부 사용자를 기술적으로 차단하려면 앱이 발급받는 단기 토큰 검증과 모바일 앱 재배포가 필요하므로 별도 보안 작업으로 분리한다

## 배포

- Firebase 프로젝트 `bookchelin`에 App Hosting 백엔드를 생성한다
- 저장소 루트 디렉터리는 `nextjs-web/`, 라이브 브랜치는 `master`
- GitHub 연결 후 `master` 변경 시 자동 롤아웃한다
- 코드와 `apphosting.yaml`은 저장소에 포함하지만, 최초 GitHub App 승인과 자동 롤아웃 연결은 Firebase 콘솔 또는 인증된 CLI 절차가 필요하다
- 기본 App Hosting URL에서 기능·SEO·Analytics를 검증한 뒤 Route 53 DNS를 연결한다

## 검증 기준

- 단위 테스트, ESLint, TypeScript 검사, `next build` 통과
- 공개/숨김/미존재 책 상세 동작 검증
- sitemap과 robots가 `bookchelin.com` 기준으로 생성됨
- JSON-LD 파싱 가능
- GA DebugView에서 주요 이벤트 확인 가능
- App Hosting 기본 URL 배포 후 기존 사이트에는 영향이 없음

## 제외 범위

- 웹 EPUB/PDF 리더
- 로그인·대여함 동기화
- 결제
- Vue 관리자 재작성
- 모바일 앱의 커스텀 도메인 딥링크 재배포
