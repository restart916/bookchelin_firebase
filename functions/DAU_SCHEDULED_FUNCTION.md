# DAU/WAU/MAU 자동 수집 (Firebase Scheduled Function)

매일 GA4(Firebase Analytics)의 DAU/WAU/MAU를 자동으로 가져와 Firestore에 저장한다.
GCP에서 실행되므로 내 맥을 켜둘 필요가 없고, 네트워크 제한도 없다.

## 추가된 것

- `functions/analytics_dau.js` — GA4 조회 + Firestore 저장 로직
- `functions/index.js`
  - `collect_dau` — **매일 KST 09:00 자동 실행** (스케줄 함수)
  - `collect_dau_now` — 수동 1회 실행용 HTTPS 트리거 (배포 직후 검증용)
- `functions/package.json` — `google-auth-library` 의존성 추가
- `functions/.eslintrc.json` — ecmaVersion 2017 → 2020 (optional chaining 등 사용)

## 저장 위치 (Firestore)

- `analytics_dau/{YYYYMMDD}` — 날짜별 문서 `{ date, dau, wau, mau, property, updatedAt }`
- `analytics_meta/dau_latest` — 가장 최근 1건 스냅샷 (대시보드/알림에서 1건만 읽기)

지표 매핑: `active1DayUsers ≈ DAU`, `active7DayUsers ≈ WAU`, `active28DayUsers ≈ MAU`.
매 실행 시 최근 3일치를 다시 가져와 늦게 집계되는 값을 보정한다(upsert).

## 배포 방법

```bash
cd /Users/yongsanglee/Code/bookchelin_firebase/functions
npm install                       # google-auth-library를 package-lock에 반영
cd ..
firebase deploy --only functions:collect_dau,functions:collect_dau_now
```

## 배포 직후 검증 (중요)

1. 배포 로그에 뜨는 `collect_dau_now`의 URL을 브라우저로 한 번 연다.
   (보통 `https://asia-northeast1-bookchelin.cloudfunctions.net/collect_dau_now`)
2. 응답이 `{"ok": true, ...}` 면 성공. Firestore의 `analytics_dau`에 데이터가 들어온다.
3. **403이 나면 권한 문제다.** 함수 로그를 확인한다:
   ```bash
   firebase functions:log --only collect_dau_now
   ```
   로그의 `serviceAccount = ...@....gserviceaccount.com` 값이 **GA4에 권한을 줘야 할 계정**이다.

### 403일 때 권한 설정

1. GCP 콘솔에서 두 API를 enable: **Google Analytics Data API**, **Google Analytics Admin API**
2. GA4(analytics.google.com) → 관리 → 속성 액세스 관리 → 위 `serviceAccount` 이메일을 **뷰어**로 추가
3. 다시 `collect_dau_now` 호출해서 `ok: true` 확인

> 참고: 1세대(v1) 함수의 기본 런타임 서비스 계정은 보통 `bookchelin@appspot.gserviceaccount.com` 이다.
> 단, 로그에 찍힌 이메일을 그대로 쓰는 게 가장 확실하다.

## 스케줄 변경

`functions/index.js`의 `collect_dau`에서:

```js
.pubsub.schedule('every day 09:00')   // 예: 'every day 07:00', 'every 6 hours'
.timeZone('Asia/Seoul')
```

수정 후 `firebase deploy --only functions:collect_dau` 재배포.

## 정리 (선택)

검증이 끝나면 `collect_dau_now` HTTPS 트리거는 삭제해도 된다(스케줄 함수만 남기기).
누구나 호출 가능한 공개 URL이므로 신경 쓰이면 제거를 권장:
`index.js`에서 `collect_dau_now` 블록을 지우고 `firebase deploy --only functions` 재배포.
