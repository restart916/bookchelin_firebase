# Web App Icons Design

## Goal

북슐랭 공개 웹사이트의 favicon과 홈 화면 아이콘을 현재 iOS/Flutter 앱에서 사용하는 공식 1024×1024 앱 아이콘과 동일하게 맞춘다.

## Source Asset

- 원본: `../bookchelin_flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset/ItunesArtwork@2x.png`
- 크기: 1024×1024
- 형태: 빨간 배경의 정사각형 전체 면적을 사용하는 북슐랭 앱 아이콘
- Android 런처용 둥근 모서리·안쪽 여백 버전은 웹 아이콘 원본으로 사용하지 않는다. 브라우저와 운영체제가 필요한 마스크를 적용하도록 한다.

## Generated Assets

Next.js App Router의 metadata file convention을 사용한다.

- `src/app/favicon.ico`: 16×16, 32×32, 48×48를 포함하는 다중 크기 ICO
- `src/app/icon.png`: 512×512 PNG
- `src/app/apple-icon.png`: 180×180 PNG
- `src/app/manifest.ts`: 사이트 이름, 테마 색상, 192×192 및 512×512 아이콘을 선언하는 Web App Manifest
- `public/icons/icon-192.png`: 192×192 PNG
- `public/icons/icon-512.png`: 512×512 PNG

모든 결과물은 같은 1024×1024 원본을 정사각 비율로 축소하며 자르기, 모서리 추가, 색상 변경을 하지 않는다.

## Metadata and Runtime Behavior

Next.js가 favicon, 일반 웹 아이콘, Apple touch icon을 자동으로 `<head>`에 연결한다. `manifest.ts`는 `/manifest.webmanifest`를 제공하고 테마 색상은 앱 아이콘의 빨간 배경색과 맞춘다. 공개 페이지의 콘텐츠, SEO canonical, 앱 링크, EPUB 뷰어에는 영향을 주지 않는다.

## Verification

- 생성 파일의 픽셀 크기와 형식을 검사한다.
- 원본과 생성 PNG의 중심 색상 및 비율이 일치하는지 확인한다.
- Next.js 테스트, lint, typecheck, production build를 실행한다.
- 배포 후 `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/manifest.webmanifest`가 200으로 응답하고 올바른 Content-Type을 반환하는지 확인한다.

