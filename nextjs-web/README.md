# 북슐랭 공개 웹

검색 유입을 책 소개 페이지로 연결하고 iOS·Android 앱 설치로 전환하는 Next.js 공개 웹입니다. 사용자 로그인, 대여함, 읽기 기록 동기화, EPUB/PDF 웹 리더는 제공하지 않습니다.

## 로컬 실행

Node 22와 Firebase Application Default Credentials가 필요합니다.

```bash
nvm use stable
gcloud auth application-default login
cp .env.example .env.local
npm ci
npm run dev
```

Firebase Web 설정값은 브라우저에서 사용하는 공개 식별자입니다. 실제 운영값은 `apphosting.yaml`에서 빌드·런타임 환경 모두에 전달됩니다. Firebase Admin SDK는 App Hosting의 Application Default Credentials로 `bookchelin` Firestore를 읽습니다. 서비스 계정 JSON은 저장소에 커밋하지 않습니다.

전체 검증:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Firebase App Hosting

- 프로젝트: `bookchelin`
- 백엔드: `bookchelin-web`
- 리전: `us-central1` (Firestore `nam5`와 인접)
- 앱 루트: `nextjs-web`
- GitHub: `restart916/bookchelin_firebase`
- 라이브 브랜치: `master`
- 자동 롤아웃: 사용

최초 백엔드 생성은 저장소 루트에서 Node stable로 실행합니다.

```bash
nvm use stable
firebase apphosting:backends:create \
  --project bookchelin \
  --backend bookchelin-web \
  --primary-region us-central1 \
  --root-dir nextjs-web \
  --app 1:658686940034:web:2a08fc1241723df936359b
```

CLI에서 GitHub 연결을 완료하지 못하면 Firebase Console → App Hosting → `bookchelin-web` → Settings → Deployment에서 저장소, 앱 루트, 라이브 브랜치를 설정하고 자동 롤아웃을 켭니다. 이후 `master`에 push된 커밋이 자동 배포됩니다.

배포 확인 후 App Hosting의 Custom domain에서 `bookchelin.com`을 추가하고, 화면에 표시되는 검증·라우팅 DNS 레코드를 AWS Route 53에 그대로 등록합니다. 인증서 발급 전에는 기존 레코드를 성급하게 제거하지 않습니다.

## 기존 Firebase Hosting과의 경계

기존 Vue 관리자와 앱 내부 EPUB WebView는 계속 `bookchelin.web.app/admin/` 아래 Firebase Hosting에서 제공합니다. 새 공개 웹은 해당 코드를 포함하거나 링크하지 않으며 `/admin/`, `/epub-viewer/`를 robots에서 차단합니다. 앱 전용 토큰 검증은 모바일 앱 호환을 함께 준비한 뒤 별도 작업으로 도입합니다.
