# 북슐랭 통합 TODO

> 세 레포(`bookchelin_firebase` / `bookchelin_android` / `bookchelin_flutter`) 공용 작업 목록.
> 처리하면서 완료 항목은 지운다. 항목 태그: `[android]` `[flutter(iOS)]` `[firebase]` `[web]` `[store]`
>
> 목표: 정체된 DAU 끌어올리기. 근거 데이터는 맨 아래 "데이터 스냅샷" 참고.
> 마지막 갱신: 2026-06-11

---

## ⚡ 즉시 처리 가능 (웹/서버/운영 — 배포 즉시 반영, 심사 불필요)

### ASO 재정비 (강하게) `[store]`
- [x] 플레이스토어 API 접근 확보 (2026-06-11) — `firebase-adminsdk-crofb@` SA를 Play Console에 초대 + androidpublisher API 활성화 완료. 등록정보 텍스트/이미지는 API로 수정 가능, **단 등록정보 실험(A/B)은 콘솔 UI 전용**
- 현재 등록정보 상태 (API로 확인): ko-KR 제목 "도서(책) 어플 - 북슐랭"(키워드 빈약), 짧은설명 "다양한 책들을 무료로 볼 수 있는 어플", 스크린샷 5장/태블릿용 0장, en-US 리스팅에 오타("Bookchellin"/"Bookschulin") + 그래픽 0개, contactWebsite가 app-ads-txt 플레이스홀더 도메인(→ bookchelin.web.app 으로 교체 후보)
- [x] 플레이스토어 제목·짧은설명·자세한설명 갱신 (ko-KR + en-US, 2026-06-11 API 커밋 — 구글 검토 후 게시. 스크립트: `scripts/update_play_listing.mjs`)
- [ ] 며칠 내 플레이스토어에서 새 등록정보 반영 확인 (검토 거부 시 이메일 옴 — 제목의 정책 위반 여부 등)
- [ ] 앱스토어(iOS) 등록정보도 동일 방향으로 갱신 — App Store Connect는 API 키 별도(p8) 필요, 콘솔에서 직접 수정이 빠를 수 있음
- [x] 개발자 웹사이트를 placeholder(app-ads-txt.com) → bookchelin.web.app 으로 교체 (2026-06-11 커밋. app-ads.txt 는 동일 내용으로 사전 배포·검증됨)
- [ ] 1~2일 후 AdMob 콘솔에서 app-ads.txt 인증 상태 정상인지 확인 (앱 → app-ads.txt 탭)
- [ ] 스크린샷 전면 교체 (현재 책 수 704권 반영, 핵심 메시지: 무료·무가입·베스트셀러 포함)
- [ ] 앱스토어 프로모션 텍스트/What's New 활용 (심사 없이 수정 가능한 영역 먼저)
- [ ] 경쟁 키워드 순위 측정 기준점 기록해두기 (변경 전/후 비교용)

### 콘텐츠 공급 — 공공데이터 PDF 파이프라인 `[firebase]` ◀ 2026-06-11 시작
신간 공급 부활 전략. 가이드: `docs/public-domain-books.md` 부록 (라이선스 판정 기준 포함)
- [x] 운전면허 필기 문제은행 2권 등록·공개 (도로교통공단, 라이선스 확인됨. cat3 최상단 order 99995/99994) — 검색 유입("운전면허 필기 기출") + 18-24 유입 노림수
- [x] 국세청 연말정산 책자 판정: ❌ 보류 (링크형 등재 + 저작권정책 부재 + All Rights Reserved)
- [ ] 농사로(농진청) 실용서: 권별 공공누리 제1유형 확인 후 다음 배치 (요리·생활 — 코어 유저 35-54 여성 적합)
- [ ] 운전면허 문제은행 개정판 모니터링 (현재 2026-03-09 시행판 — 공단 공지 게시판)
- [ ] 추가 버티컬 검증: 질병관리청 건강 가이드, 고용노동부 근로 가이드, 키즈 전래동화(만료저작물 파이프라인)

### 웹 SEO 퍼널 확장 `[web]` `[firebase]`
- [ ] Search Console 등록·사이트맵 제출 상태 점검 (`/sitemap.xml` 은 web_book SSR이 생성 중)
- [ ] 책 상세 SSR 페이지(`/book/{id}`) 메타·구조화 데이터(JSON-LD Book) 보강
- [ ] "○○ 무료로 읽기" 류 검색 의도를 받는 카테고리/큐레이션 랜딩 추가 검토
- [ ] 만료저작물(저작권 만료) 단편은 본문 일부 노출 가능한지 검토 — SEO 콘텐츠로 활용 (일반 도서는 본문 노출 금지 원칙 유지)

### 푸시 재방문 유도 — 자동화 시스템 `[firebase]` ◀ 진행 중
사람이 보내는 게 아니라 시스템이 적절히(과하지 않게) 보내는 구조.
**실행 가이드: `docs/push-campaigns.md`** (2026-06-11 작성 — 현황 조사·캠페인 설계·운영 규칙·측정 기준 포함)
- [x] FCM 토픽/토큰 현황 파악 → 토픽 구독·토큰 저장 둘 다 없음. 콘솔 캠페인만 가능, Admin SDK 발송은 Phase 1(토큰 저장) 이후
- [x] 설계: Phase 0 = 콘솔 반복 캠페인으로 ①신규 D1 ②7일 미접속 (비개인화). ③이어읽기 개인화는 Phase 1
- [x] 빈도·시간대·문구 규칙 명문화 (주 1회 상한 / 20:00 KST / 런북 참고)
- [x] 사전 점검: APNs 키 등록 확인 (개발/프로덕션 모두 등록됨, 2026-06-11)
- [x] 콘솔에서 캠페인 2개 생성·게시 (2026-06-11):
  - "신규 설치 D1 웰컴 (자동)" — 매일 20:00 KST, 타깃: 최초 실행 2일 미만 (AOS+iOS), 사용자당 평생 1회. 첫 발송 6/11 20:00
  - "주간 미접속 리마인드 (자동)" — 매주 수 20:00 KST, 타깃: 마지막 앱 참여 7일 초과 (AOS+iOS), 사용자당 7일에 1회 이하. 첫 발송 6/17 20:00
- [ ] 본인 기기로 실수신 확인 (6/11 20:00 신규 D1 발송분 또는 테스트 메시지) — 광고 닫기/탭 동작 확인
- [ ] 1주 후 Messaging 보고서 확인: 발송수 vs 표시수(Android 권한 문제 규모) vs 열람수 → 런북 판단 기준 적용
- [ ] 발송 효과 측정: analytics_dau 로 수요일 vs 비수요일 DAU 비교 (베이스라인은 5월 데이터 이미 존재)
- ⚠️ Android 13+ 신규 설치자는 알림 권한 미요청 상태라 수신 불가 (장기 유저는 수신 가능) → 권한 요청은 아래 "설치 첫날 임팩트"의 앱 릴리즈에 묶기. 도달 규모는 캠페인 리포트의 발송수 vs 표시수로 파악

### 의미 없는 리뷰 숨기기 (마이너) `[firebase]`
- [ ] `book_reviews` 도배성 리뷰(무의미 문자 반복) 필터 기준 정의
- [ ] 일회성 정리 스크립트 작성 (`scripts/` 에 추가, hidden 플래그 방식 권장 — 삭제보다 안전)
- [ ] 클라이언트가 hidden 플래그를 반영하는지 확인 — 미반영이면 앱 배포 필요 항목으로 이동

### 광고 노출 조건·텀 조사 → 정리 ✅ 조사 완료 (2026-06-11)
현재 코드 기준 (양 플랫폼 동일 상수):
- **리더 내 전면광고**: 읽기 시간 누적 **300초(5분)** 마다. Flutter는 "잠시 후 광고가 게재됩니다" 토스트 3초 후 표시, 광고 닫으면 타이머 리셋 (`admob_timer_mixin.dart`, `ReaderActivity.java SHOW_AD_TIME=300`)
- **리더 종료 시 전면광고**: **15초 이상** 읽고 나가면 노출 (`SHOW_EXIT_AD_TIME=15`) — 체감 불만("광고만 보여주네요")의 유력 원인. 5분 광고보다 이쪽이 더 공격적
- **배너**: 리더/메인 AdMob 배너 상시
- **링크선택(link_select) 상세**: 진입 시 전면광고 (별도 광고 유닛)
- 참고: `ReaderActivity.java` 에 RemoteConfig `show_ad_time` 으로 텀을 원격 제어하려던 **주석 처리된 코드가 이미 존재** → 아래 "RemoteConfig 광고 제어" 항목으로 연결
- [ ] 추후 조절 1순위는 빈도 자체보다 **종료 광고(15초 룰)와 X버튼 UX** — 리뷰 불만과 직결, 수익 기여는 상대적으로 작을 것으로 추정 (노출 로그로 검증 필요)

---

## 📱 앱 배포 필요 (릴리즈/심사 필요 — 모아서 릴리즈 트레인으로)

### iOS 크래시 수정 `[flutter(iOS)]` — 최우선
앱스토어 3.42점의 주범. 리뷰에서 확인된 재현 경로:
- [ ] 검색창에 입력 시 즉시 크래시 (아이폰)
- [ ] 아이패드: 첫 화면 후 튕김
- [ ] 맥북(Designed for iPad): 흰 화면
- [x] Crashlytics 도입 여부 확인 (2026-06-12) — Android(18.4.1)·iOS(firebase_crashlytics 5.2.2) 둘 다 이미 수집 중. GA4 기준 최근 30일 Android 예외 15건/유저 6명(영향 ~0.4%)으로 출시 블로커 없음. 상세 스택은 Crashlytics 콘솔에서 (iOS 검색 튕김 재현 단서도 거기서 찾을 것)
- [ ] `[flutter(iOS)]` 대여함 표지 깨짐 수정 ✅ (2026-06-12, bookchelin_flutter `e11a911`) — 다음 검수 시 대여함에서 표지 정상 표시 확인

### 인앱 리뷰 프롬프트 ✅ 확인 완료 → iOS만 추가
- 조사 결과: **Android는 이미 있음** (`BookDetailActivity.java` — 리더에서 돌아오면 RateThisApp 조건 충족 시 Google Play In-App Review). **Flutter(iOS)에는 없음** → 앱스토어 평점이 50개뿐인 이유
- [ ] Flutter에 `in_app_review` 패키지로 동일 트리거 구현 (책 1권 일정 시간 이상 읽고 리더에서 복귀 시)
- [ ] iOS 크래시 수정 배포 **후에** 켜기 (고장난 상태에서 리뷰 요청하면 역효과)

### 설치 첫날 임팩트 (D1 잔존율 7~9% → 개선) `[android]` `[flutter(iOS)]`
데이터: 최근 신규 설치 코호트의 D1 잔존율 7~9%, 90일 설치 1,160 vs 삭제 972. 설치자 대부분이 첫날 이후 안 돌아옴.
- [ ] 첫 실행 경험 점검: 설치 → 첫 책 읽기 시작까지 몇 탭인지 측정, 줄이기
- [ ] 첫 실행 시 "바로 읽기 좋은 책" 추천 (온보딩 큐레이션) — 회원가입 없음이 강점이므로 첫 화면에서 바로 읽게
- [ ] 신규 유저 첫 N분 광고 면제 (첫인상에 종료 광고 맞으면 바로 삭제할 가능성) — RemoteConfig 제어와 연계
- [ ] 다음날 푸시 1회 (위 푸시 자동화와 연계 — 서버 쪽은 즉시 처리 가능)
- [x] `[android]` POST_NOTIFICATIONS 런타임 권한 요청 추가 (2026-06-12, bookchelin_android `47d8d2d` — 메인 진입 시 요청. 죽은 dynamic-links/appindexing 의존성 제거 포함). 추후 "첫 책 읽기 완료 후 요청"으로 시점 최적화 여지
- [ ] `[android]` `[flutter(iOS)]` FCM 토큰 Firestore 저장 — Phase 1 개인화 푸시(이어읽기 리마인드)의 전제조건 (`docs/push-campaigns.md` Phase 1 참고)

### RemoteConfig 광고 제어 부활 `[android]` `[flutter(iOS)]`
- [ ] `show_ad_time`/`show_exit_ad_time` 을 RemoteConfig 값으로 — Android는 주석 코드 살리고, Flutter는 신규 구현
- [ ] 한 번 배포해두면 이후 광고 텀 조절은 콘솔에서 즉시 가능 (실험·롤백 자유)

### 뷰어 기능 개선 `[android]` `[flutter(iOS)]`
리뷰에서 직접 요청된 것 위주:
- [ ] 2장씩 넘어가는 버그 수정
- [ ] 가로 넘기기(페이지 스와이프) 모드
- [ ] 쪽수/진행률 표시
- [ ] 대여함에서 다 읽은 책 삭제 기능
- [ ] 전면광고 X버튼이 노치/상단 safe area에 가려 안 눌리는 문제 (iPhone mini/12 리뷰 다수)

### 딥링크 재구축 `[android]` `[flutter(iOS)]` `[web]`
- 현황: `firebase_dynamic_links` 는 서비스 종료(2025-08-25)로 양 클라이언트에서 제거됨. 현재 공유하기는 정적 블로그 URL 폴백 (flutter `book_detail_page._onClickShare`)
- [x] 서버측 검증 파일 배포 (2026-06-11): `bookchelin.web.app/.well-known/assetlinks.json` (Play 앱서명+업로드 키 SHA-256 둘 다, 구글 Digital Asset Links API 검증 통과) + `apple-app-site-association` (`/book/*` → 앱, Content-Type 헤더 설정). Play Console에 "웹 도메인 미연결로 딥링크 2개 작동 안 함" 경고 떠 있던 것의 해소 시작
- [x] `[android]` AndroidManifest 인텐트 필터 교체(page.link→web.app `/book/` pathPrefix, autoVerify) + `NewMainActivity.handleAppLink()` + `Util.generateContentLink` web.app URL화 (bookchelin_android `7ae035a`, compileDebugJavaWithJavac 통과)
- [x] `[flutter(iOS)]` entitlement applinks→web.app + `app_links` 패키지 + main.dart 딥링크 핸들러(navigatorKey, getInitialLink+uriLinkStream) (bookchelin_flutter `3814f6f`, flutter analyze 통과)
- [x] 양 클라이언트 공유하기를 `https://bookchelin.web.app/book/{id}` URL로 교체 (덤: 양쪽 다 죽은 Dynamic Links 단축링크를 쓰고 있어 공유가 깨져 있던 것도 복구)
- [x] 웹 폴백 배너 (2026-06-12, `2876333`) — web_book SSR 책 페이지에 Smart App Banner app-argument + OS인식 CTA(Android intent:// / iOS App Store) 추가. 카톡·인스타 인앱 브라우저에서도 앱 직행. functions:web_book 배포·검증 완료
- [ ] **앱 배포 후 검증** (양 스토어 출시 완료): 실기기에서 ① 카톡으로 `/book/{id}` 탭 → 앱 책 상세 직행(설치자) ② 인앱 브라우저에서 웹 뜰 때 "앱에서 열기" 버튼 동작 ③ 미설치 기기는 스토어로. Android autoVerify / iOS AASA 캐시(재설치 필요할 수 있음) 확인
- [x] iOS 웹 "앱에서 열기" — 커스텀 스킴 bookchelin://book/{id} 로 스토어 미경유 직행 (2026-06-12). 웹 `1829581`(배포·CDN퍼지 완료) + Flutter `fede1b4`(_handleUri 커스텀스킴 파싱, **다음 iOS 배포 1.1.2 필요**). Android는 intent://로 이미 완성
  - ⚠️ 스토어 "열기" 버튼으로는 특정 책 전달 불가(deferred deep link=Dynamic Links 종료). 직접 열기만 가능
  - ⚠️ web_book 은 CDN s-maxage=86400 — 함수만 배포하면 옛 버전 캐싱, `firebase deploy --only hosting` 으로 퍼지해야 함
- [ ] Play Console "앱 색인 생성"에 bookchelin.web.app 등록 (App Links 검증 후. 2026-06-11 확인: 등록 0개. "앱 작업"/"인라인 설치"는 해당 없음)

### 신규 광고 포맷 실험 `[android]` `[flutter(iOS)]`
- [ ] 리스트 사이 네이티브 광고 (메인/카테고리 목록)
- [ ] 앱 오픈 광고(App Open Ad) — 단, D1 잔존율 개선과 상충 가능성 있으니 신규 유저 제외 조건 필수
- [ ] 리워드 광고: "광고 보면 N시간 광고 없이 읽기" — 종료 광고 대체 후보
- [ ] 포맷별 eCPM 비교 후 저성과 포맷 정리 (현재 eCPM $0.94 — 개선 여지 큼)

---

## 🧊 신경 덜 써도 되는 것 (보류 / 조건부)

- **광고 빈도 줄이기** — 수익이 출판사 쉐어 구조라 일정 수준 필요. 일괄 축소 대신 RemoteConfig 도입 후 미세 조절로 전환. 우선순위는 종료 광고 UX > 빈도.
- **독서 이벤트(time_event/limit_event) 부활** — 신규 출판사 책 공급이 끊겼고, 원래도 "제한적으로 읽게 하는" 장치였지 DAU 견인책이었는지 불분명. 구작으로 이벤트성을 만들 묘수가 생기면 재검토. (참고: flutter `limit_event_timer_mixin.dart:54` 에 이벤트 재활성화 시 터지는 null 가드 이슈 있음 — 부활시킨다면 먼저 수정)

---

## 📊 데이터 스냅샷 (2026-06-11 조사)

| 지표 | 전성기 (2021) | 현재 (최근 1년/월) |
|---|---|---|
| MAU | 17,939 (2021.01 정점) | ~1,350 |
| DAU | (DAU/MAU 5~7%로 유사 추정) | 70~100 |
| 월 광고수익 | $3,349 (2021.01) | ~$46 |
| eCPM (연간) | $3.38 | $0.94 |
| 한국 비중 | 96.8% | 90.2% (해외 ~10%) |
| 최다 연령대 | 45-54 (17.7%) | 45-54 (13.3%) — 분포 거의 동일 |
| 성별 (식별분) | 여 42% / 남 25% | 여 29% / 남 21% — 여초 동일 |
| D1 잔존율 | 미측정 | 7~9% |
| 플레이스토어 | — | 4.52 (1,384개) |
| 앱스토어 | — | 3.42 (50개) |

- 유입 채널: direct + 스토어 오가닉이 100%. 마케팅/추천 유입 0
- 신규 유입: 월 12,461 (2021.01) → ~400 (현재)
- 책: 704권, 앱 내 리뷰 2,172건 평균 4.19점
- GA4 property: `185590610`, DAU 미러링: Firestore `analytics_dau` 컬렉션
