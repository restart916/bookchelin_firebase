# 독서시간(read_time) 측정 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포그라운드 실독서 시간만, 두 클라(Android/iOS) 동일하게, 강제종료 손실 ≤30초로 집계하고 서버는 손상값을 차단·이상치를 관찰한다. 구앱·구서버와 완전 하위호환, 시간·사람 이중집계 0건.

**Architecture:** 각 플랫폼의 측정 로직을 순수 단위로 추출한다 — 서버 `classifyReadTime`(JS), 클라 `ReadTimeTracker`(Dart/Java, 단조시계 주입). 척추 불변식("모든 flush는 직전 mark 이후 델타만 보내고 mark를 리셋, 누적은 ACTIVE일 때만 전진")을 단위에 캡슐화하고, 라이프사이클/광고/Firestore 글루는 얇게 호출만 한다. `read_time_logs` 스키마는 additive(`source`/`session_id`/`client`)로만 확장.

**Tech Stack:** Cloud Functions v1 (Node 22, `node:test`), Flutter (Dart, `flutter_test`, `Stopwatch`), Android (Java 8, JUnit4, `SystemClock.elapsedRealtime`).

## Global Constraints

- **하위호환 절대**: `read_time_logs`의 기존 필드 `book_id`/`read_time`/`user_uid`는 삭제·이름변경 금지. 신규 필드는 전부 선택(additive). 구앱이 보내는 구조도 서버가 그대로 합산해야 함.
- **불변식**: 모든 flush는 `delta = monotonicNow − lastMark`만 전송하고 `lastMark = monotonicNow`. 누적은 ACTIVE(포그라운드+화면켜짐+광고/다이얼로그 없음)일 때만.
- **하트비트 주기**: 30초.
- **서버**: 값 클램프(자르기) 금지. 손상값(비숫자/NaN/Infinity/음수)만 합산 제외, 유한 양수 거대값(`> 3600`초)은 합산 유지 + 로그 + `anomaly:true` 마커.
- **단조시계**: Android `SystemClock.elapsedRealtime()`(읽기시간 한정 — 광고용 `start_time`은 SharedPreferences에 영속되는 wall-clock이므로 절대 건드리지 말 것), Flutter `Stopwatch`.
- **`delta < 5초` flush는 skip**(기존 임계 유지).
- **브랜치**: 각 레포에 `feat/read-time-rework`. firebase 레포는 이미 생성·체크아웃됨. flutter/android는 각 Phase 첫 작업에서 생성.
- **커밋 메시지 말미**: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **구앱 동결 규칙 무관**: 본 작업은 `book_category`를 건드리지 않음. 단 Android 이벤트 다이얼로그 로직(`processTimeEvent`/`processLimitEvent`)은 read_time_logs와 분리해 보존할 것.

---

## Phase A — 서버 (functions, 가장 먼저 배포 가능)

### Task A1: `classifyReadTime` 순수 모듈

**Files:**
- Create: `functions/read_time_sanitize.js`
- Test: `functions/read_time_sanitize.test.js`

**Interfaces:**
- Produces:
  - `ANOMALY_THRESHOLD_SECONDS: number` (= `3600`)
  - `classifyReadTime(raw: any) => { valid: boolean, value: number, anomaly: boolean, reason: 'ok'|'over_threshold'|'corrupt' }`
    - `valid=false` → 합산 제외(손상). `anomaly=true` → 합산하되 로그+마커.

- [ ] **Step 1: Write the failing test**

```js
// functions/read_time_sanitize.test.js
const test = require('node:test');
const assert = require('node:assert');
const { classifyReadTime, ANOMALY_THRESHOLD_SECONDS } = require('./read_time_sanitize');

test('정상 양수는 valid, 비이상치', () => {
  const r = classifyReadTime(120);
  assert.deepStrictEqual(r, { valid: true, value: 120, anomaly: false, reason: 'ok' });
});

test('0초도 valid(비이상치)', () => {
  assert.strictEqual(classifyReadTime(0).valid, true);
  assert.strictEqual(classifyReadTime(0).anomaly, false);
});

test('임계 초과 유한 양수는 valid + anomaly', () => {
  const r = classifyReadTime(ANOMALY_THRESHOLD_SECONDS + 1);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.anomaly, true);
  assert.strictEqual(r.reason, 'over_threshold');
  assert.strictEqual(r.value, ANOMALY_THRESHOLD_SECONDS + 1); // 값 보존(자르지 않음)
});

test('임계 정확히 같은 값은 비이상치', () => {
  assert.strictEqual(classifyReadTime(ANOMALY_THRESHOLD_SECONDS).anomaly, false);
});

test('음수는 corrupt(합산 제외)', () => {
  const r = classifyReadTime(-5);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'corrupt');
});

test('NaN/Infinity/문자열/undefined는 corrupt', () => {
  for (const bad of [NaN, Infinity, -Infinity, '120', undefined, null, {}]) {
    assert.strictEqual(classifyReadTime(bad).valid, false, `${bad} should be corrupt`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && node --test read_time_sanitize.test.js`
Expected: FAIL (Cannot find module './read_time_sanitize')

- [ ] **Step 3: Write minimal implementation**

```js
// functions/read_time_sanitize.js
// read_time_logs 의 read_time 값 분류기 (순수 함수, 부수효과 없음).
//   valid=false  → 합산에서 제외(손상값). corrupt.
//   anomaly=true → 합산은 하되 로그 + anomaly 마커(거대값, 값은 보존/자르지 않음).
// 정책: 값을 절대 클램프하지 않는다. 손상만 차단, 거대값은 관찰만 한다.

const ANOMALY_THRESHOLD_SECONDS = 3600;

function classifyReadTime(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { valid: false, value: 0, anomaly: false, reason: 'corrupt' };
  }
  if (raw > ANOMALY_THRESHOLD_SECONDS) {
    return { valid: true, value: raw, anomaly: true, reason: 'over_threshold' };
  }
  return { valid: true, value: raw, anomaly: false, reason: 'ok' };
}

module.exports = { classifyReadTime, ANOMALY_THRESHOLD_SECONDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && node --test read_time_sanitize.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/read_time_sanitize.js functions/read_time_sanitize.test.js
git commit -m "feat(functions): read_time 분류기(손상 차단/이상치 표시) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A2: 트리거·일배치에 분류기 적용

**Files:**
- Modify: `functions/index.js` — `add_time_read_time_logs`(약 506–540행), `updateReadTimeLog`(약 96–144행)

**Interfaces:**
- Consumes: `classifyReadTime`, `ANOMALY_THRESHOLD_SECONDS` (Task A1)

- [ ] **Step 1: import 추가** (`index.js` 상단 require 블록, 약 32행 부근)

```js
const { classifyReadTime } = require('./read_time_sanitize');
```

- [ ] **Step 2: `add_time_read_time_logs` 합산 분기 수정**

기존(약 511–522행):
```js
    const user_uid = newValue.user_uid || 'unknown';
    const book_id = newValue.book_id;

    // 활성 이벤트가 없는 책은 ...
    const activeBooks = await getActiveBooks(db);
    if (activeBooks.time.has(book_id) || activeBooks.limit.has(book_id)) {
      await updateTimeEvent(book_id, user_uid, newValue.read_time, context.timestamp);
      await updateLimitEvent(book_id, user_uid, newValue.read_time, context.timestamp);
    }
```
교체:
```js
    const user_uid = newValue.user_uid || 'unknown';
    const book_id = newValue.book_id;

    const cls = classifyReadTime(newValue.read_time);
    if (!cls.valid) {
      // 손상값(비숫자/NaN/Infinity/음수): 합산 제외. 데이터는 남기되 마커+로그.
      console.warn('read_time_logs corrupt value skipped', JSON.stringify({
        docId: context.params.document_id, book_id, user_uid,
        read_time: newValue.read_time, source: newValue.source || null,
        client: newValue.client || null,
      }));
      await snap.ref.set({ corrupt: true }, { merge: true });
      // createdAt/expireAt 부착은 아래 공통 로직에서 계속 진행(TTL 청소 위해)
    } else {
      if (cls.anomaly) {
        // 유한 양수 거대값: 값은 보존(자르지 않음) + 합산 + 마커/로그.
        console.warn('read_time_logs anomaly (over threshold)', JSON.stringify({
          docId: context.params.document_id, book_id, user_uid,
          read_time: cls.value, source: newValue.source || null,
          client: newValue.client || null,
        }));
        await snap.ref.set({ anomaly: true }, { merge: true });
      }
      // 활성 이벤트가 없는 책은 time_event / limit_event 조회를 스킵해 읽기 비용을 절감한다.
      const activeBooks = await getActiveBooks(db);
      if (activeBooks.time.has(book_id) || activeBooks.limit.has(book_id)) {
        await updateTimeEvent(book_id, user_uid, cls.value, context.timestamp);
        await updateLimitEvent(book_id, user_uid, cls.value, context.timestamp);
      }
    }
```
> 주의: 이후의 `createdAt`/`expireAt` 부착 로직(약 524–537행)은 그대로 둔다 — 손상/이상치 문서도 TTL 청소 대상이어야 함.

- [ ] **Step 3: `updateReadTimeLog` 일배치 방어**

기존(약 107–123행 루프 안)에서 `read_info.read_time`을 그대로 더하는 부분을, 분류기로 걸러서 더하도록 수정.

기존:
```js
    let read_info = doc.data();
    let book_id = read_info.book_id;
    if (book_id in count_data) {
      count_data[book_id] += read_info.read_time;
    } else {
      count_data[book_id] = read_info.read_time;
    }

    let user_uid = read_info.user_uid;
    if (user_uid !== undefined) {
      if (user_uid in count_data_by_user) {
        count_data_by_user[user_uid] += read_info.read_time;
      } else {
        count_data_by_user[user_uid] = read_info.read_time;
      }
```
교체(앞부분에 가드 추가, 합산은 `rt` 사용):
```js
    let read_info = doc.data();
    let book_id = read_info.book_id;
    const cls = classifyReadTime(read_info.read_time);
    if (!cls.valid) {
      continue; // 손상값은 일집계에서도 제외
    }
    const rt = cls.value;
    if (book_id in count_data) {
      count_data[book_id] += rt;
    } else {
      count_data[book_id] = rt;
    }

    let user_uid = read_info.user_uid;
    if (user_uid !== undefined) {
      if (user_uid in count_data_by_user) {
        count_data_by_user[user_uid] += rt;
      } else {
        count_data_by_user[user_uid] = rt;
      }
```
> `classifyReadTime`는 Step 1에서 import됨. 루프 안 `cls`/`rt`는 블록 스코프(`for...of` 본문)라 충돌 없음.

- [ ] **Step 4: lint 통과 확인**

Run: `cd functions && npm run lint`
Expected: 에러 0 (경고만 있으면 OK). `classifyReadTime` 미사용/중복선언 에러 없어야 함.

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `cd functions && node --test`
Expected: 기존 테스트 전부 PASS (event_cache/web_book/reviews 등) + read_time_sanitize PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): read_time 손상값 합산 제외 + 거대값 이상치 로깅/마커

- add_time_read_time_logs: corrupt(비숫자/NaN/음수) 합산 제외, >3600s 값 보존+로그+anomaly 마커
- updateReadTimeLog 일배치도 손상값 방어
- 값 클램프는 하지 않음(비파괴)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> 배포(수동, 사용자 승인 후): `firebase deploy --only functions:add_time_read_time_logs` 및 `firebase deploy --only functions:minutes_job`(updateReadTimeLog 호출 경로 확인 후). 이 플랜에서는 배포를 실행하지 않는다.

---

## Phase B — Flutter 측정 단위 (`ReadTimeTracker`)

### Task B1: `ReadTimeTracker` 순수 Dart 클래스

**Files:**
- Create: `bookchelin_flutter/lib/src/services/read_time_tracker.dart`
- Test: `bookchelin_flutter/test/read_time_tracker_test.dart`

**Interfaces:**
- Produces:
  - `typedef MonotonicClockMs = int Function();`
  - `class ReadTimeTracker`:
    - `ReadTimeTracker(MonotonicClockMs clock, {int minFlushSeconds = 5})`
    - `void start()` — ACTIVE, mark=now
    - `int? flush()` — ACTIVE 유지, mark 리셋, `delta초` 반환(≥minFlush) 또는 null
    - `int? suspend()` — flush 후 PAUSED. 멱등(이미 PAUSED면 null)
    - `void resume()` — mark=now (멱등)
    - `bool get isActive`

- [ ] **Step 1: Write the failing test**

```dart
// bookchelin_flutter/test/read_time_tracker_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_test_app/src/services/read_time_tracker.dart';

void main() {
  late int nowMs;
  ReadTimeTracker make() => ReadTimeTracker(() => nowMs);

  setUp(() => nowMs = 0);

  test('start 후 flush는 경과 초를 반환하고 mark를 리셋', () {
    final t = make();
    t.start();
    nowMs = 30000;
    expect(t.flush(), 30);
    nowMs = 50000;
    expect(t.flush(), 20); // 직전 flush(30s) 이후 델타만
  });

  test('5초 미만 flush는 null(드롭)이지만 mark는 리셋', () {
    final t = make();
    t.start();
    nowMs = 3000;
    expect(t.flush(), isNull);
    nowMs = 4000;
    expect(t.flush(), isNull); // 직전 flush 이후 1초
    nowMs = 14000;
    expect(t.flush(), 10);
  });

  test('suspend는 델타를 반환하고 PAUSED, 이후 flush/suspend는 null(멱등)', () {
    final t = make();
    t.start();
    nowMs = 30000;
    expect(t.suspend(), 30);
    expect(t.isActive, isFalse);
    nowMs = 60000;
    expect(t.flush(), isNull);   // PAUSED 동안 경과는 집계 안 됨
    expect(t.suspend(), isNull); // 멱등
  });

  test('resume 후에는 resume 시점부터 다시 누적(PAUSED 구간 제외)', () {
    final t = make();
    t.start();
    nowMs = 10000;
    t.suspend();      // 10s 집계
    nowMs = 100000;   // PAUSED 90s (백그라운드)
    t.resume();
    nowMs = 130000;   // resume 후 30s
    expect(t.flush(), 30); // 백그라운드 90s 제외, 30s만
  });

  test('resume은 멱등(연속 호출 시 마지막 시점 기준)', () {
    final t = make();
    t.start();
    nowMs = 5000;
    t.suspend();
    nowMs = 10000;
    t.resume();
    nowMs = 12000;
    t.resume();       // mark를 12s로 갱신
    nowMs = 40000;
    expect(t.flush(), 28); // 12s 기준
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bookchelin_flutter && flutter test test/read_time_tracker_test.dart`
Expected: FAIL (Target of URI doesn't exist: read_time_tracker.dart)

- [ ] **Step 3: Write minimal implementation**

```dart
// bookchelin_flutter/lib/src/services/read_time_tracker.dart
//
// 독서시간 측정 단위(순수). 척추 불변식:
//   모든 flush는 직전 mark 이후 델타(초)만 반환하고 mark를 리셋한다.
//   누적은 ACTIVE(mark != null)일 때만 전진한다. PAUSED 구간은 집계되지 않는다.
// 단조시계(ms)를 주입한다 — 운영은 Stopwatch, 테스트는 가짜 클럭.

typedef MonotonicClockMs = int Function();

class ReadTimeTracker {
  final MonotonicClockMs _clock;
  final int minFlushSeconds;
  int? _lastMarkMs; // null = PAUSED

  ReadTimeTracker(this._clock, {this.minFlushSeconds = 5});

  bool get isActive => _lastMarkMs != null;

  void start() {
    _lastMarkMs = _clock();
  }

  /// ACTIVE 유지. 델타 초(>= minFlushSeconds)를 반환, 아니면 null. mark는 항상 리셋.
  int? flush() {
    if (_lastMarkMs == null) return null;
    final now = _clock();
    final seconds = ((now - _lastMarkMs!) / 1000).floor();
    _lastMarkMs = now;
    if (seconds < minFlushSeconds) return null;
    return seconds;
  }

  /// flush 후 PAUSED. 멱등(이미 PAUSED면 null).
  int? suspend() {
    final seconds = flush();
    _lastMarkMs = null;
    return seconds;
  }

  /// ACTIVE 재개. 멱등(mark를 now로 갱신).
  void resume() {
    _lastMarkMs = _clock();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bookchelin_flutter && flutter test test/read_time_tracker_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit** (먼저 브랜치 생성)

```bash
cd bookchelin_flutter && git checkout -b feat/read-time-rework
git add lib/src/services/read_time_tracker.dart test/read_time_tracker_test.dart
git commit -m "feat: ReadTimeTracker 측정 단위(단조시계, suspend/resume) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase C — Flutter 리더 글루 (P0/P1: 라이프사이클 + 광고 pause + 단조시계)

> 글루(웹뷰/PDF 위젯 + Firestore 쓰기)는 단위 테스트 대상이 아니다. 측정 로직은 Task B1에서 검증됨. 여기서는 빌드 + 수동 매트릭스로 검증한다.

### Task C1: 광고 믹스인에 read-pause 콜백 추가

**Files:**
- Modify: `bookchelin_flutter/lib/src/mixins/admob_timer_mixin.dart`

**Interfaces:**
- Produces: `initTimer`에 선택 콜백 추가 — `void Function()? onReadPause`(광고 show 직전), `void Function()? onReadResume`(광고 close). 리더 페이지가 자신의 tracker.suspend/resume를 연결.

- [ ] **Step 1: 믹스인에 콜백 필드/시그니처 추가**

`initTimer` 시그니처(약 20행)와 필드를 수정:
```dart
  late AdmobTimerMixinListener _listener;
  void Function()? _onReadPause;
  void Function()? _onReadResume;

  initTimer(AdmobTimerMixinListener listener,
      {void Function()? onReadPause, void Function()? onReadResume}) {
    startTimeForAd = DateTime.now();
    _periodicTimer = Timer.periodic(Duration(seconds: 1), (Timer timer) => _checkAd());
    _listener = listener;
    _onReadPause = onReadPause;
    _onReadResume = onReadResume;
    // ... (이하 _interstitial 초기화 그대로)
```

- [ ] **Step 2: 광고 show 직전 pause, close 시 resume 호출**

`_checkAd`의 3초 예약 콜백(약 67–71행) 수정:
```dart
    _adShowTimer = Timer(Duration(seconds: 3), () {
      if (_disposed) return;
      _onReadPause?.call();   // 광고 표시 직전 독서시간 flush + PAUSED (iOS는 lifecycle 미발생 대비)
      _interstitial.show();
      _listener();
    });
```
`_closeAd`(약 74–78행) 수정:
```dart
  _closeAd() {
    print('_onAdmobFullScreenListener');
    startTimeForAd = DateTime.now();
    _onReadResume?.call();    // 광고 종료 → 독서시간 재개
    if (!_disposed) _listener();
  }
```

- [ ] **Step 3: 정적 분석**

Run: `cd bookchelin_flutter && flutter analyze lib/src/mixins/admob_timer_mixin.dart`
Expected: No issues (또는 기존과 동일한 기존 경고만).

- [ ] **Step 4: Commit**

```bash
cd bookchelin_flutter
git add lib/src/mixins/admob_timer_mixin.dart
git commit -m "feat: 광고 표시/종료 시 독서시간 pause/resume 콜백 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C2: EPUB 웹 리더 페이지 글루 교체

**Files:**
- Modify: `bookchelin_flutter/lib/src/pages/book_epub_web_page.dart`

**Interfaces:**
- Consumes: `ReadTimeTracker`(B1), `admob_timer_mixin` 콜백(C1)

- [ ] **Step 1: import + 필드 도입**

상단 import에 추가:
```dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter_test_app/src/services/read_time_tracker.dart';
```
State 클래스 필드(기존 `late DateTime startTime;` 약 23행을 교체):
```dart
  final Stopwatch _sw = Stopwatch()..start();
  late final ReadTimeTracker _tracker = ReadTimeTracker(() => _sw.elapsedMilliseconds);
  final String _sessionId = DateTime.now().microsecondsSinceEpoch.toString();
```

- [ ] **Step 2: State에 WidgetsBindingObserver 부착**

State 선언에 mixin 추가하고 initState/dispose에서 옵저버 등록·해제, tracker.start():
```dart
class _BookEpubWebPageState extends State<BookEpubWebPage>
    with AdmobTimerMixin, WidgetsBindingObserver {
```
initState(약 30–36행)에서 `startTime = DateTime.now();`를 제거하고:
```dart
    _tracker.start();
    WidgetsBinding.instance.addObserver(this);
    initTimer(() => setState(() {}),
        onReadPause: () => _flush('ad', pause: true),
        onReadResume: () => _tracker.resume());
```
> 기존 `initTimer(() => setState(() {}));` 호출이 있으면 위로 교체.

dispose(약 80–85행)에 추가(super.dispose 전에 flush, 옵저버 해제):
```dart
  @override
  Future<void> dispose() async {
    WidgetsBinding.instance.removeObserver(this);
    await _flush('exit');
    _sw.stop();
    super.dispose();
    await disposeTimer();
    await interstitial.dispose();
  }
```

- [ ] **Step 3: didChangeAppLifecycleState 구현**

State에 추가:
```dart
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _flush('background', pause: true);
    } else if (state == AppLifecycleState.resumed) {
      _tracker.resume();
    }
  }
```

- [ ] **Step 4: updateReadTime/checkAd를 tracker 기반으로 교체**

기존 `updateReadTime()`(약 136–156행)과 `checkAd()`의 `startTime` 사용처(약 159–160행)를 교체.

`updateReadTime`를 `_flush`로 대체:
```dart
  Future<void> _flush(String source, {bool pause = false}) async {
    final seconds = pause ? _tracker.suspend() : _tracker.flush();
    if (seconds == null) return; // <5s 또는 이미 PAUSED
    final props = Provider.of<AppState>(context, listen: false);
    final data = <String, dynamic>{
      'user_uid': props.user?.uid,
      'book_id': book.id,
      'read_time': seconds,
      'source': source,
      'session_id': _sessionId,
      'client': Platform.isIOS ? 'ios' : 'android',
    };
    await FirebaseFirestore.instance.collection('read_time_logs').add(data);
  }
```
WillPopScope.onWillPop(약 100–106행)의 `await updateReadTime();`를 `await _flush('exit');`로 교체:
```dart
      onWillPop: () async {
        checkAd();
        await _flush('exit');
        return false;
      },
```
`checkAd()`(약 158–166행)에서 `startTime` 기반 경과 계산을, 광고 표시 여부 판단용으로 tracker와 무관한 별도 측정이 필요하다. 종료광고 판단은 "이번 리더 세션 총 노출 시간"이 기준이므로 `_sw.elapsed`(세션 시작부터의 단조 경과)를 사용:
```dart
  void checkAd() {
    final readTime = _sw.elapsed.inSeconds; // 리더 진입 후 총 경과(광고 판단용)
    if (readTime < AdmobFullScreen.SHOW_EXIT_AD_TIME) {
      Navigator.of(context).pop(true);
      return;
    }
    final lastShownAt = AdmobFullScreen.lastShownAt;
    if (lastShownAt != null &&
        DateTime.now().difference(lastShownAt).inSeconds < AdmobFullScreen.SHOW_EXIT_AD_TIME) {
      Navigator.of(context).pop(true);
      return;
    }
    if (_loadAd) {
      interstitial.show();
    } else {
      Navigator.of(context).pop(true);
    }
  }
```
> `_sw`는 PAUSED 동안에도 흐르지만 여기선 "광고를 띄울 만큼 머물렀나" 판단용이라 무방. 독서시간 집계는 전적으로 `_tracker`가 담당.

- [ ] **Step 5: 정적 분석 + 빌드**

Run: `cd bookchelin_flutter && flutter analyze lib/src/pages/book_epub_web_page.dart`
Expected: No issues (기존 경고 제외). 남은 `startTime` 참조가 없어야 함.

- [ ] **Step 6: Commit**

```bash
cd bookchelin_flutter
git add lib/src/pages/book_epub_web_page.dart
git commit -m "feat: EPUB 웹 리더 독서시간을 ReadTimeTracker로 교체(라이프사이클/광고 pause)

- 백그라운드/광고 시간 제외, 단조시계, dispose flush
- read_time_logs에 source/session_id/client 부착

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C3: PDF 리더 페이지 글루 교체

**Files:**
- Modify: `bookchelin_flutter/lib/src/pages/book_reader_pdf_page.dart`

- [ ] **Step 1: 동일 패턴 적용**

Task C2의 Step 1–4와 동일한 변경을 PDF 페이지에 적용한다(클래스명·State명만 다름):
- import 3종 추가, `startTime` 필드를 `_sw`/`_tracker`/`_sessionId`로 교체.
- State에 `WidgetsBindingObserver` 추가, initState에서 `_tracker.start()` + `addObserver` + `initTimer(..., onReadPause/onReadResume)`.
- dispose에서 `removeObserver` + `await _flush('exit')` + `_sw.stop()`.
- `didChangeAppLifecycleState` 추가(C2 Step3 동일 코드).
- `updateReadTime()`(약 233–252행)를 `_flush(...)`(C2 Step4 코드)로 교체, 종료/뒤로가기 경로의 `await updateReadTime();`(약 107행)를 `await _flush('exit');`로 교체.
- PDF 페이지의 종료광고 판단부(약 217–218행 `startTime` 사용)가 있으면 C2 Step4의 `checkAd` 패턴(`_sw.elapsed.inSeconds`)으로 교체.

> 실제 라인은 파일을 열어 확인할 것. 핵심 불변식: 모든 read_time_logs 쓰기는 `_flush`만 통해서 나간다. `startTime`/`DateTime.now().difference` 잔재가 없어야 한다.

- [ ] **Step 2: 정적 분석**

Run: `cd bookchelin_flutter && flutter analyze lib/src/pages/book_reader_pdf_page.dart`
Expected: No issues (기존 경고 제외).

- [ ] **Step 3: 전체 테스트 회귀**

Run: `cd bookchelin_flutter && flutter test`
Expected: 기존 테스트 + read_time_tracker_test 전부 PASS.

- [ ] **Step 4: Commit**

```bash
cd bookchelin_flutter
git add lib/src/pages/book_reader_pdf_page.dart
git commit -m "feat: PDF 리더 독서시간을 ReadTimeTracker로 교체(라이프사이클/광고 pause)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C4: `link_select_detail` read_time 경로 확인

**Files:**
- Inspect: `bookchelin_flutter/lib/src/pages/link_select_detail.dart`

- [ ] **Step 1: read_time_logs 기록 여부 확인**

Run: `cd bookchelin_flutter && grep -n "read_time_logs\|read_time\|DateTime.now" lib/src/pages/link_select_detail.dart`
- read_time_logs에 쓰는 경로가 있으면 Task C2 패턴(tracker + lifecycle)을 동일 적용하고 커밋.
- 없으면(외부 링크 뷰어 등 시간 미집계) 변경 없이 다음 단계로. 결과를 커밋 메시지/주석으로 남길 필요 없음.

---

## Phase D — Flutter 하트비트 (P2: 30초 정기 flush)

### Task D1: 리더 페이지에 30초 하트비트 타이머

**Files:**
- Modify: `bookchelin_flutter/lib/src/pages/book_epub_web_page.dart`, `bookchelin_flutter/lib/src/pages/book_reader_pdf_page.dart`

**Interfaces:**
- Consumes: `_tracker`, `_flush`(C2/C3)

- [ ] **Step 1: 하트비트 타이머 필드 추가**

각 리더 State에:
```dart
  Timer? _heartbeat;
```

- [ ] **Step 2: initState에서 시작, dispose에서 취소**

initState의 `_tracker.start();` 다음 줄에:
```dart
    _heartbeat = Timer.periodic(const Duration(seconds: 30), (_) => _flush('heartbeat'));
```
dispose에서 `_sw.stop();` 앞에:
```dart
    _heartbeat?.cancel();
```

- [ ] **Step 3: 정적 분석 + 테스트**

Run: `cd bookchelin_flutter && flutter analyze && flutter test`
Expected: No issues, 전체 PASS.

> 동작 근거(수동): `_flush('heartbeat')`는 `_tracker.flush()`를 호출 → ACTIVE면 직전 flush 이후 델타(≈30s)를 쓰고 mark 리셋, PAUSED면 null로 아무것도 안 씀. 이중집계 없음(불변식, B1에서 검증).

- [ ] **Step 4: Commit**

```bash
cd bookchelin_flutter
git add lib/src/pages/book_epub_web_page.dart lib/src/pages/book_reader_pdf_page.dart
git commit -m "feat: 리더 30초 하트비트로 독서시간 정기 flush(강제종료 손실 최소화)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Flutter 수동 검증 매트릭스** (디바이스/시뮬레이터)

다음을 실제 실행해 로그/`read_time_logs`로 확인:
- [ ] 30초 이상 연속 읽기 → 30초마다 `source:heartbeat` doc 생성.
- [ ] 홈 버튼(백그라운드) 후 60초 뒤 복귀 → `source:background` doc은 백그라운드 진입 시점까지만, 복귀 후 재개. 백그라운드 60초 미집계.
- [ ] 5분 경과로 전면광고 표시 → 닫힘: 광고 노출 시간 미집계(`source:ad` doc은 광고 직전까지).
- [ ] 리더 오픈 중 앱 강제종료 → 손실 ≤30초(마지막 heartbeat까지 보존).
- [ ] 야간 방치(백그라운드 장시간) 후 복귀·종료 → 거대값 doc 미발생.
- [ ] 뒤로가기 종료 → `source:exit` doc.

---

## Phase E — Android (P1 단조시계 + P2 하트비트)

> Android는 이미 onPause flush로 백그라운드/광고를 대체로 제외한다. 변경 핵심: (1) 읽기시간 측정을 단조시계로, (2) read_time_logs 쓰기를 `ReadTimeTracker`로 일원화하고 30초 하트비트 추가, (3) **이벤트 다이얼로그용 `read_start_time`은 read_time_logs와 분리해 보존**(다이얼로그 회귀 방지).

### Task E1: `ReadTimeTracker` 순수 Java 클래스

**Files:**
- Create: `bookchelin_android/app/src/main/java/com/bookchelin/bookchelin/util/ReadTimeTracker.java`
- Test: `bookchelin_android/app/src/test/java/com/bookchelin/bookchelin/util/ReadTimeTrackerTest.java`

**Interfaces:**
- Produces:
  - `interface ReadTimeTracker.Clock { long elapsedMillis(); }`
  - `ReadTimeTracker(Clock clock)` / `ReadTimeTracker(Clock clock, int minFlushSeconds)`
  - `void start()`, `Integer flush()`, `Integer suspend()`, `void resume()`, `boolean isActive()`
  - 반환 `Integer`: 초(≥minFlush) 또는 `null`.

- [ ] **Step 1: Write the failing test**

```java
// bookchelin_android/app/src/test/java/com/bookchelin/bookchelin/util/ReadTimeTrackerTest.java
package com.bookchelin.bookchelin.util;

import org.junit.Test;
import static org.junit.Assert.*;

public class ReadTimeTrackerTest {
    static class FakeClock implements ReadTimeTracker.Clock {
        long now = 0;
        public long elapsedMillis() { return now; }
    }

    @Test public void flushReturnsDeltaAndResetsMark() {
        FakeClock c = new FakeClock();
        ReadTimeTracker t = new ReadTimeTracker(c);
        t.start();
        c.now = 30000;
        assertEquals(Integer.valueOf(30), t.flush());
        c.now = 50000;
        assertEquals(Integer.valueOf(20), t.flush());
    }

    @Test public void subFiveSecondsDroppedButMarkResets() {
        FakeClock c = new FakeClock();
        ReadTimeTracker t = new ReadTimeTracker(c);
        t.start();
        c.now = 3000;
        assertNull(t.flush());
        c.now = 14000;
        assertEquals(Integer.valueOf(11), t.flush());
    }

    @Test public void suspendIsIdempotentAndPausesAccrual() {
        FakeClock c = new FakeClock();
        ReadTimeTracker t = new ReadTimeTracker(c);
        t.start();
        c.now = 30000;
        assertEquals(Integer.valueOf(30), t.suspend());
        assertFalse(t.isActive());
        c.now = 60000;
        assertNull(t.flush());
        assertNull(t.suspend());
    }

    @Test public void resumeExcludesPausedInterval() {
        FakeClock c = new FakeClock();
        ReadTimeTracker t = new ReadTimeTracker(c);
        t.start();
        c.now = 10000;
        t.suspend();
        c.now = 100000; // paused 90s
        t.resume();
        c.now = 130000; // +30s
        assertEquals(Integer.valueOf(30), t.flush());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bookchelin_android && ./gradlew testDebugUnitTest --tests "com.bookchelin.bookchelin.util.ReadTimeTrackerTest"`
Expected: FAIL (compile error: ReadTimeTracker not found)

- [ ] **Step 3: Write minimal implementation**

```java
// bookchelin_android/app/src/main/java/com/bookchelin/bookchelin/util/ReadTimeTracker.java
package com.bookchelin.bookchelin.util;

/**
 * 독서시간 측정 단위(순수). 척추 불변식:
 *   모든 flush는 직전 mark 이후 델타(초)만 반환하고 mark를 리셋한다.
 *   누적은 ACTIVE(mark != null)일 때만 전진한다. PAUSED 구간은 집계되지 않는다.
 * 단조시계(ms)를 주입한다 — 운영은 SystemClock.elapsedRealtime, 테스트는 가짜 클럭.
 */
public class ReadTimeTracker {
    public interface Clock { long elapsedMillis(); }

    private final Clock clock;
    private final int minFlushSeconds;
    private Long lastMarkMs; // null = PAUSED

    public ReadTimeTracker(Clock clock) { this(clock, 5); }

    public ReadTimeTracker(Clock clock, int minFlushSeconds) {
        this.clock = clock;
        this.minFlushSeconds = minFlushSeconds;
    }

    public boolean isActive() { return lastMarkMs != null; }

    public void start() { lastMarkMs = clock.elapsedMillis(); }

    /** ACTIVE 유지. 델타 초(>= minFlushSeconds)를 반환, 아니면 null. mark는 항상 리셋. */
    public Integer flush() {
        if (lastMarkMs == null) return null;
        long now = clock.elapsedMillis();
        int seconds = (int) ((now - lastMarkMs) / 1000);
        lastMarkMs = now;
        if (seconds < minFlushSeconds) return null;
        return seconds;
    }

    /** flush 후 PAUSED. 멱등(이미 PAUSED면 null). */
    public Integer suspend() {
        Integer seconds = flush();
        lastMarkMs = null;
        return seconds;
    }

    /** ACTIVE 재개. 멱등. */
    public void resume() { lastMarkMs = clock.elapsedMillis(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bookchelin_android && ./gradlew testDebugUnitTest --tests "com.bookchelin.bookchelin.util.ReadTimeTrackerTest"`
Expected: BUILD SUCCESSFUL, 4 tests pass.

- [ ] **Step 5: Commit** (먼저 브랜치 생성)

```bash
cd bookchelin_android && git checkout -b feat/read-time-rework
git add app/src/main/java/com/bookchelin/bookchelin/util/ReadTimeTracker.java \
        app/src/test/java/com/bookchelin/bookchelin/util/ReadTimeTrackerTest.java
git commit -m "feat: ReadTimeTracker 측정 단위(단조시계, suspend/resume) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E2: ReaderActivity 글루 교체 (단조시계 + tracker + 하트비트)

**Files:**
- Modify: `bookchelin_android/app/src/main/java/com/bookchelin/bookchelin/ReaderActivity.java`

**Interfaces:**
- Consumes: `ReadTimeTracker`(E1)

- [ ] **Step 1: import + 필드 추가**

import:
```java
import android.os.SystemClock;
import com.bookchelin.bookchelin.util.ReadTimeTracker;
import java.util.UUID;
```
필드(기존 `read_start_time` 근처, 약 76행):
```java
    private final ReadTimeTracker readTimeTracker =
            new ReadTimeTracker(SystemClock::elapsedRealtime);
    private final String sessionId = UUID.randomUUID().toString();
    private android.os.Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
```
> `read_start_time`(이벤트 다이얼로그용)은 **그대로 둔다**. 단, 단조성을 위해 그 대입부의 `System.currentTimeMillis()/1000`도 `SystemClock.elapsedRealtime()/1000`으로 바꾼다(약 264, 752행). processTimeEvent/processLimitEvent의 `curr` 계산(약 586, 614행)도 동일하게 `SystemClock.elapsedRealtime()/1000`로 맞춘다. **광고용 `start_time`(SharedPreferences 영속, 약 147–151, 712행)은 절대 변경 금지(wall-clock 유지).**

- [ ] **Step 2: tracker 생명주기 연결**

onResume(약 748–752행)에서 `readTimeTracker.resume();` 추가(기존 `read_start_time = ...`도 유지):
```java
    protected void onResume() {
        super.onResume();
        read_start_time = SystemClock.elapsedRealtime()/1000; // 이벤트 다이얼로그용
        readTimeTracker.resume();
        startHeartbeat();
    }
```
onPause(약 737–745행)에서 기존 `updateReadTime();`를 tracker suspend 기반으로 교체:
```java
    protected void onPause() {
        super.onPause();
        stopHeartbeat();
        flushReadTime("background", true); // suspend + 쓰기
    }
```
onCreate에서 최초 `read_start_time = ...`(약 264행) 다음에 `readTimeTracker.start();` 추가.

- [ ] **Step 3: flushReadTime / heartbeat 헬퍼 추가**

기존 `updateReadTime(boolean)`(약 797–819행)을 다음으로 교체(읽기 로그 쓰기를 tracker로 일원화):
```java
    private void flushReadTime(String source, boolean pause) {
        Integer seconds = pause ? readTimeTracker.suspend() : readTimeTracker.flush();
        if (seconds == null) return; // <5s 또는 이미 PAUSED
        Map<String, Object> data = new HashMap<>();
        data.put("book_id", this.book_id);
        data.put("read_time", seconds);
        data.put("user_uid", this.userUid);
        data.put("source", source);
        data.put("session_id", this.sessionId);
        data.put("client", "android");
        firebaseDb.collection("read_time_logs").add(data)
                .addOnSuccessListener(d -> Log.d(TAG, "flushReadTime ok: " + seconds))
                .addOnFailureListener(e -> Log.w(TAG, "flushReadTime fail", e));
    }

    private void startHeartbeat() {
        if (heartbeatHandler == null) heartbeatHandler = new android.os.Handler();
        stopHeartbeat();
        heartbeatRunnable = new Runnable() {
            @Override public void run() {
                flushReadTime("heartbeat", false);
                heartbeatHandler.postDelayed(this, 30000);
            }
        };
        heartbeatHandler.postDelayed(heartbeatRunnable, 30000);
    }

    private void stopHeartbeat() {
        if (heartbeatHandler != null && heartbeatRunnable != null) {
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
        }
    }
```

- [ ] **Step 4: 기존 updateReadTime 호출부 정리**

`updateReadTime()`/`updateReadTime(false)` 호출부(약 744, 764, 793–795행)를 정리:
- onPause의 호출은 Step2에서 `flushReadTime("background", true)`로 교체됨.
- `gotoDetailActivity()`의 `updateReadTime(false);`(약 764행)는 `flushReadTime("exit", false);`로 교체.
- 무인자 `updateReadTime()`/`updateReadTime(boolean)` 메서드 정의는 제거(Step3에서 대체).
- `gotoDetailActivity()`의 종료광고 판단부(약 766–767행 `reading_time = curr - read_start_time`)는 그대로 둬도 무방(이벤트용 read_start_time 사용). 동작 동일.

- [ ] **Step 5: 컴파일 + 단위 테스트 회귀**

Run: `cd bookchelin_android && ./gradlew :app:compileDebugJavaWithJavac testDebugUnitTest`
Expected: BUILD SUCCESSFUL. ReadTimeTracker 테스트 PASS. 컴파일 에러 0(미사용 메서드/심볼 없음).

- [ ] **Step 6: Commit**

```bash
cd bookchelin_android
git add app/src/main/java/com/bookchelin/bookchelin/ReaderActivity.java
git commit -m "feat: ReaderActivity 독서시간 ReadTimeTracker 일원화(단조시계+30초 하트비트)

- read_time_logs 쓰기를 tracker로 통일, source/session_id/client 부착
- 이벤트 다이얼로그용 read_start_time은 분리 보존(회귀 방지)
- 광고용 start_time(영속 wall-clock)은 불변

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E3: PdfReaderActivity / WebEpubActivity 동일 적용

**Files:**
- Modify: `bookchelin_android/app/src/main/java/com/bookchelin/bookchelin/PdfReaderActivity.java`
- Modify: `bookchelin_android/app/src/main/java/com/bookchelin/bookchelin/WebEpubActivity.java`

- [ ] **Step 1: PdfReaderActivity에 E2 패턴 적용**

E2의 Step1–4를 PdfReaderActivity에 적용. 이 액티비티의 읽기시간 측정 변수/`onPause`/`onResume`/종료 경로를 동일 구조로 교체(`readTimeTracker`+`flushReadTime`+heartbeat, 이벤트용 변수는 분리 보존, 광고 `start_time` 불변). 실제 라인은 파일에서 확인.

- [ ] **Step 2: WebEpubActivity에 적용**

`WebEpubActivity`는 `writeReadTime()`(약 192–204행)에서 `onPause` 시 `read_time_logs`에 elapsed를 쓴다([WebEpubActivity.java:49] 주석 참고). 여기에도:
- `readTimeTracker`(SystemClock 주입) + `sessionId` 도입.
- onResume에서 `resume()`+`startHeartbeat()`, onPause에서 `stopHeartbeat()`+`flushReadTime("background", true)`.
- 기존 `writeReadTime()`의 elapsed 계산을 tracker로 대체, 쓰기에 `source/session_id/client` 부착.
- 진입 시 `start()`.

- [ ] **Step 3: 컴파일 + 테스트**

Run: `cd bookchelin_android && ./gradlew :app:compileDebugJavaWithJavac testDebugUnitTest`
Expected: BUILD SUCCESSFUL, 테스트 PASS.

- [ ] **Step 4: Commit**

```bash
cd bookchelin_android
git add app/src/main/java/com/bookchelin/bookchelin/PdfReaderActivity.java \
        app/src/main/java/com/bookchelin/bookchelin/WebEpubActivity.java
git commit -m "feat: PDF/WebEpub 리더 독서시간 ReadTimeTracker 일원화(단조시계+하트비트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Android 수동 검증 매트릭스** (디바이스/에뮬레이터)

- [ ] 30초 연속 읽기 → 30초마다 `source:heartbeat` doc.
- [ ] 홈(백그라운드) 후 복귀 → 백그라운드 시간 미집계(onPause suspend, onResume resume).
- [ ] 5분 광고 표시→닫힘 → 광고 시간 미집계(onPause로 suspend되어 광고 중 비집계).
- [ ] 강제종료 → 손실 ≤30초.
- [ ] **이벤트 회귀**: time_event 책에서 누적 40분 도달 시 리뷰 다이얼로그 정상 표시(`read_start_time` 보존 확인). limit_event 잔여시간 종료 다이얼로그 정상.
- [ ] 기기 시계 변경 → 측정 영향 없음.

---

## Phase F — 통합 (메인 브랜치 반영)

### Task F1: 세 레포 브랜치를 main/master로 통합

- [ ] **Step 1: 각 레포 변경 검토**

Run(각 레포): `git --no-pager log --oneline master..feat/read-time-rework` 로 커밋 목록 확인. firebase는 `master`, flutter/android는 각 기본 브랜치명 확인(`git branch`).

- [ ] **Step 2: 통합 방식 결정**

superpowers:finishing-a-development-branch 스킬로 PR/머지 옵션을 사용자에게 제시하고 선택대로 진행. (이 플랜은 자동 머지를 강제하지 않음 — 사용자 승인 후 진행.)

- [ ] **Step 3: 서버 배포(사용자 승인 후)**

`firebase deploy --only functions:add_time_read_time_logs` 우선 배포(무해, 구앱 관찰 시작) → 이후 앱 스토어 배포 일정에 맞춰 클라 릴리스.

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage**
- 5.1 불변식 → B1/E1 단위에 캡슐화 + 테스트. ✅
- 5.2 상태머신(heartbeat/background/ad/exit/resume) → C2/C3/D1(Flutter), E2/E3(Android). ✅
- 5.3 additive 스키마(source/session_id/client) → `_flush`/`flushReadTime`. ✅
- 5.4 서버 로깅 전용 + 손상 가드 + 일배치 방어 → A1/A2. ✅
- 5.5 이벤트 배열 비대화 watch-item → 본 플랜 범위 외(현행 유지), 스펙에 명시. ✅
- 6 롤아웃 순서(서버 우선) → Phase 순서 + F1 Step3. ✅
- 단조시계 / 광고 start_time 영속 주의 → Global Constraints + E2 Step1. ✅
- 하위호환/무중복 → Global Constraints + B1/E1 불변식 테스트. ✅

**2. Placeholder scan**: "TBD/TODO/적절히 처리" 없음. 글루 태스크(C2/C3/E2/E3)는 추상 지시가 아니라 실제 추가 코드 + 호출부 라인 + 검증 명령 포함. 라인 번호는 "약 N행"으로 표기(파일 진화 대비), 검증 단계에서 잔재 grep으로 확인. ✅

**3. Type consistency**: `flush()`/`suspend()`/`resume()`/`start()`/`isActive` 시그니처가 Dart(B1)·Java(E1)·소비처(C/D/E2/E3)에서 일치. 서버 `classifyReadTime` 반환 `{valid,value,anomaly,reason}`이 A2 소비와 일치. `source` 값 집합(`heartbeat/exit/background/ad`)이 스펙과 일치. ✅

> 주: 글루 태스크의 "약 N행"은 현재 파일 기준 근사치다. 구현 시 해당 메서드/심볼명으로 위치를 확정하고, 각 태스크 마지막 검증 명령(analyze/compile/grep)으로 잔재 없음을 보장한다.
