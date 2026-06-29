# 독서시간(read_time) 측정 개편 설계

- **날짜**: 2026-06-29
- **상태**: 설계 승인 → 구현 계획 작성 예정
- **범위**: `bookchelin_firebase`(백엔드) + `bookchelin_android` + `bookchelin_flutter`(클라)
- **관련**: `read_time_logs`, `time_event`/`limit_event` 집계, `dayly_total_time*`, `total_time_by_user`

## 1. 배경 / 문제

독서시간은 클라가 "구간(segment)" 단위로 `read_time_logs`에 doc을 add하고, 백엔드 트리거가 그 값을 무조건 합산하는 구조다. 코드 리뷰 결과 다음 문제가 확인됐다.

### 현재 동작 (플랫폼별 차이)

| 상황 | Android (`ReaderActivity`) | Flutter/iOS (`book_epub_web_page` / `book_reader_pdf_page`) |
|---|---|---|
| flush 시점 | 나갈 때 + **백그라운드 진입(onPause)마다** 구간 분할 후 전송, start 리셋 | **오직 뒤로가기(WillPopScope)에서만** 전송 |
| 홈 이동 | 멈춤(onPause flush → onResume 리셋, 백그라운드 제외) | **안 멈춤** — `didChangeAppLifecycleState` 미구현, 백그라운드 시간 전부 카운트 |
| 광고 시간 | onPause/onResume 거쳐 대체로 제외 | **포함** — 광고 오버레이는 lifecycle 이벤트 없음 |
| 앱 강제종료 | onPause flush로 doc 생성 → Firestore 오프라인 큐 보존 → 대체로 안전 | `dispose()`에서 flush 안 함 → **그 세션 통째로 유실** |
| 야간/장시간 방치 | 화면 꺼지면 onPause로 끊김(단 keep-screen-on이면 큰 구간 가능) | **initState→뒤로가기까지 wall-clock** → 며칠 백그라운드면 그 전체가 doc 하나로 |

### 핵심 결함

1. **iOS 구조적 과다 집계**: Flutter 리더에 앱 라이프사이클 처리가 없어 백그라운드·광고 시간이 독서시간에 포함됨. "한 번에 너무 큰 숫자"의 주범.
2. **서버 검증/상한 전무**: `add_time_read_time_logs`가 `read_time`을 그대로 신뢰·합산. 거대값/NaN이 totals·이벤트 집계·일평균까지 오염.
3. **wall-clock 기반**: `System.currentTimeMillis` / `DateTime.now` 차이 → 시계 점프·타임존 변경에 취약.
4. **정기 flush 없음**: 구간 끝(나갈 때/백그라운드)에만 전송 → iOS는 구간이 무한정 길어질 수 있고 강제종료 시 측정 자체가 안 됨.
5. **플랫폼 동작 불일치**로 Android/iOS 수치 직접 비교가 불가.

## 2. 목표 / 비목표

### 목표
- 포그라운드·실제 독서 시간만 집계 (백그라운드/광고/화면꺼짐 제외).
- 두 클라 동작 통일.
- 강제종료 손실 최소화(최대 1주기).
- 거대값/손상값에 대한 가시성 확보(서버 관찰).
- **구앱·구서버와 완전 하위호환**, **시간·사람 이중집계 0건**.

### 비목표 (이번 범위 외)
- 이미 오염된 과거 데이터 소급 정리. (값을 자르지 않기로 결정 → 별도 판단)
- Firestore 규칙 강화 / 쓰기를 callable로 이전. (별도 보안부채 프로젝트)
- 백엔드 v1→v2 마이그레이션.

## 3. 결정 사항

| 항목 | 결정 |
|---|---|
| 하트비트 flush 주기 | **30초** (강제종료 손실 ≤30초, 정확도 우선) |
| 서버 처리 | **클램프(값 자르기) 안 함, 이상치 로깅만**. 큰 숫자는 클라(소스)에서 차단하고 서버는 비파괴적으로 관찰 |
| 손상값(음수/NaN/Infinity/비숫자) | **합산에서 제외**(값 보존이 아니라 손상 차단). 이상치 로깅과는 별개 |

## 4. 접근 방식

채택: **A. append-only 델타 문서 + 하트비트**. 기존 `read_time_logs` 스키마와 서버 합산 로직을 유지하고 flush 빈도만 올린다. 구앱과 의미가 동일("델타 전송 + 기준점 리셋")해 신·구 문서가 섞여도 서버가 구분 없이 정확히 합산된다.

기각:
- **B. 세션당 doc 1개 in-place 업데이트** — `onCreate` 트리거의 증분 합산이 깨지고 이중집계 위험.
- **C. 로컬 DB 누적 후 일괄 업로드** — 강제종료 손실 최소화 이점 상실 + 로컬 저장 복잡도 증가.

## 5. 설계 상세

### 5.1 척추 불변식 (모든 클라 공통)

> **모든 flush는 `delta = monotonicNow − lastMark`만 전송하고 `lastMark = monotonicNow`로 리셋한다. 누적은 리더가 "포그라운드 + 화면켜짐 + 광고/다이얼로그 없음"일 때만 전진한다.**

보장:
- **시간 무중복**: 모든 순간은 최대 한 번만 계산됨(구간 겹침 불가).
- **사람 무중복**: 서버가 `user_count`를 첫 서브문서 생성 시에만 +1, 시간은 `total_time += delta`로 누적(`functions/index.js` `updateTimeEvent`/`updateLimitEvent`). flush 빈도가 올라가도 그대로 정확.
- **하위호환**: 구앱도 이미 "델타+리셋"(거친 시점에). 서버는 신·구 문서를 동일하게 합산.

### 5.2 리더 상태머신 (Android/Flutter 통일)

상태: `ACTIVE`(누적 중) / `PAUSED`(누적 정지)

| 이벤트 | 동작 |
|---|---|
| 리더 진입 | `ACTIVE`, `lastMark = monotonicNow` |
| 30초 틱 (`ACTIVE` 중) | `flush(delta, source="heartbeat")`, mark 리셋 |
| 앱 백그라운드 (lifecycle `paused`/`hidden`) | `flush(delta, source="background")` → `PAUSED` |
| 앱 복귀 (`resumed`) | mark 리셋 → `ACTIVE` |
| 광고 표시 직전 | `flush(delta, source="ad")` → `PAUSED` |
| 광고 닫힘 | mark 리셋 → `ACTIVE` |
| 리더 종료 (뒤로/`dispose`) | `flush(delta, source="exit")` |

규칙:
- `delta < 5s`면 skip(기존 임계 유지). 30초 틱이라 평상시 항상 통과. pause 직후 잔여(<5s)만 드물게 손실 — 무시 가능.
- **단조시계**: Android `SystemClock.elapsedRealtime()`, Flutter `Stopwatch`. wall-clock 차이 대신 사용해 시계 점프 면역. (`ACTIVE` 중에만 delta를 재고 복귀 시 mark를 리셋하므로 PAUSED 동안의 sleep 시간은 자동 제외)
- **iOS 광고 주의**: 전면광고는 같은 앱의 모달이라 lifecycle 이벤트가 안 올 수 있음 → 광고 pause는 **광고 콜백으로 명시 처리**(Android는 lifecycle로도 커버되나 동일 코드로 통일).
- lifecycle은 `paused`/`hidden`/`detached`에서 pause, `resumed`에서 재개. `inactive`는 사용하지 않음(iOS 제어센터/통화 등 일시적 상태 과민반응 방지).

### 5.3 `read_time_logs` 스키마 — additive only

기존(유지): `{ book_id, read_time, user_uid }` + 서버 부착 `createdAt`, `expireAt`.

신규 선택 필드(구앱 미전송 / 구서버 무시):
- `source`: `"heartbeat" | "exit" | "background" | "ad"` — flush 사유(분석/디버깅)
- `session_id`: 리더 1회 오픈당 UUID — 디버깅 및 향후 dedup 여지
- `client`: `"android" | "ios"`, `app_version` — 선택

필드 삭제·이름변경 0건 → 구앱·구서버 그대로 동작.

### 5.4 서버: `add_time_read_time_logs` (로깅 전용)

`functions/index.js`의 트리거 수정:

1. **합산 로직 유지, 값 안 자름.** (결정 반영)
2. **손상값 가드(합산 제외)**: `read_time`이 숫자가 아니거나 `!isFinite` 또는 `< 0`이면 `updateTimeEvent`/`updateLimitEvent` 및 일배치 대상에서 제외(현재는 NaN이 totals를 오염시킴). 구조적 로그 남김.
3. **이상치 로깅(비파괴)**: 유한 양수지만 `read_time > ANOMALY_THRESHOLD`(기본 `3600`초)이면 구조적 `console.warn`(+ 선택적 `notifyDiscord`)으로 `{docId, book_id, user_uid, read_time, source, client}` 기록. 문서에 `anomaly: true` 마커만 additive로 부착(데이터 파괴 없음, 향후 필터 여지). **값은 그대로 합산.**
4. `ANOMALY_THRESHOLD`는 상수로 분리(추후 조정/원격설정 여지).

> 주: 일배치 `updateReadTimeLog`(`index.js`)도 동일하게 손상값(비숫자/NaN)을 합산에서 제외하도록 방어 추가.

### 5.5 이벤트 서브컬렉션 watch-item

30초 하트비트 → `read_history`의 `logs`/`datetime` 배열이 flush마다 1건씩 증가(예: 40분 이벤트면 1인당 ~80건). `total_time`/`total_read_time`은 정확. 배열 비대화가 문제되면 이벤트엔 per-heartbeat append 대신 **종료 시 1건만** 기록하는 옵션을 검토(이번엔 watch-item으로 명시, 기본은 현행 유지).

## 6. 롤아웃 순서 (안전·하위호환)

1. **서버 먼저** 배포: 손상값 가드 + 이상치 로깅. 무해하고 구앱에 즉시 도움(구앱 거대값 관찰).
2. **클라 P0/P1** 앱 업데이트: lifecycle observer + 광고 pause + 단조시계.
3. **클라 P2** 앱 업데이트: 30초 하트비트.

혼재 기간에도 신·구 문서 의미가 동일해 이중집계 없음.

## 7. 변경 파일 (구현 단위)

### P0 — 서버
- `functions/index.js`: `add_time_read_time_logs` 손상값 가드 + 이상치 로깅 + `anomaly` 마커; `updateReadTimeLog` 손상값 방어. `ANOMALY_THRESHOLD` 상수.

### P0 — Flutter
- `lib/src/pages/book_epub_web_page.dart`, `lib/src/pages/book_reader_pdf_page.dart`: `WidgetsBindingObserver` 추가 — `paused`/`hidden`에서 `flush+PAUSED`, `resumed`에서 mark 리셋. `dispose()`에서도 flush.
- (확인) `lib/src/pages/link_select_detail.dart`도 read_time 기록 경로면 동일 적용 검토.

### P1 — Flutter
- `lib/src/mixins/admob_timer_mixin.dart` 및 리더 페이지: 광고 표시 직전 `flush+PAUSED`, 닫힘 시 mark 리셋. 읽기 타이머와 광고 타이머 분리 유지.
- wall-clock → `Stopwatch`(단조) 전환.

### P1 — Android
- `ReaderActivity.java`, `PdfReaderActivity.java`, `WebEpubActivity.java`: `System.currentTimeMillis()` → `SystemClock.elapsedRealtime()`(읽기시간 측정 한정). 광고 표시 시 flush+리셋이 이미 onPause로 커버되는지 확인 후 필요한 부분만 보강.

### P2 — 양 클라
- 공통 "하트비트 누적기"(30초 틱 + 상태머신) 도입. Flutter는 mixin, Android는 헬퍼/타이머로 구현. 위 상태머신·불변식·schema 필드(`source`, `session_id`) 적용.

## 8. 테스트 / 검증

### 서버
- `add_time_read_time_logs` 단위 검증: 정상 양수(합산+무로그), 거대 양수(합산+anomaly 로그+마커), 음수/NaN/비숫자(합산 제외+로그), `source`/`client` 전파. (mock `snap`/`context`)
- 합산 불변: 동일 delta 시퀀스 입력 시 totals/event 누적이 기존과 일치(거대·손상값만 분기).

### 클라 (수동 테스트 매트릭스)
- 백그라운드(홈) → 복귀: 백그라운드 시간 미집계 확인.
- 광고 표시 → 닫힘: 광고 시간 미집계 확인.
- 30초 이상 연속 읽기: 30초마다 doc 생성 확인.
- 강제종료(리더 오픈 중): 손실 ≤30초 확인.
- 야간 방치(장시간 백그라운드) 후 복귀·종료: 거대값 미발생 확인.
- 시계 변경: 측정값 영향 없음 확인(단조시계).
- 신·구 앱 동시: 서버 합산 정확성·무중복 확인.

## 9. 미해결/후속
- 이벤트 `logs` 배열 비대화(5.5) — 운영 관찰 후 결정.
- 과거 오염 데이터 정리 — 필요 시 별도 스펙.
- 보안(규칙/ callable) — 별도 프로젝트.
