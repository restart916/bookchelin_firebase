# Firestore 읽기/저장 비용 절감 P2·P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Firestore read costs via three runtime changes (trending window, event-skip cache, daily aggregates) and two storage/retention improvements (expireAt TTL, Storage cache headers).

**Architecture:** P2-1 is a one-liner constant change. P2-3 introduces a small `event_cache.js` module + Firestore `event_state/active_books` doc that lets the log trigger skip event queries for 99%+ of logs. P2-2 partially extends `updateReadTimeLog` to build `dayly_reader_count` aggregates but does NOT yet swap `generateHomeDynamic`—cross-day deduplication risk is too high. P3-1 and P3-3 add forward-looking metadata (expireAt / Cache-Control) without touching existing data.

**Tech Stack:** Node.js 20/22, firebase-functions v1, firebase-admin, node:test (built-in test runner), moment-timezone.

**Branch:** `feat/cost-reduction-p2-p3`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `functions/home_dynamic.js` | Modify (line 11) | P2-1: window 7→3 |
| `functions/home_dynamic.js` | Add function | P2-2: `aggregateReadersFromDailyDocs` (not wired in) |
| `functions/home_dynamic.test.js` | Add tests | P2-2: equivalence tests |
| `functions/event_cache.js` | Create | P2-3: `getActiveBooks`, `invalidateActiveBooksCache`, `rebuildActiveBooksCache` |
| `functions/event_cache.test.js` | Create | P2-3: unit tests for cache module |
| `functions/index.js` | Modify | P2-3: use cache in trigger; rebuild in daily_job; add `refresh_active_books` endpoint; P3-1: set `expireAt` |
| `scripts/upload_gongu_books.js` | Modify | P3-3: add `cacheControl` metadata |
| `scripts/backfill_expire_at.js` | Create | P3-1: backfill script (DO NOT RUN) |
| `scripts/backfill_storage_cache_headers.js` | Create | P3-3: backfill script (DO NOT RUN) |

---

## Task 1: [P2-1] TRENDING_WINDOW_DAYS 7→3

**Files:**
- Modify: `functions/home_dynamic.js:11`

- [x] **Step 1: Change constant**

```js
// functions/home_dynamic.js line 11
const TRENDING_WINDOW_DAYS = 3;
```

- [x] **Step 2: Run existing tests**

```bash
cd functions && node --test home_dynamic.test.js
```
Expected: all tests PASS (cutoff = now-3d; test fixtures use dates within that window)

- [x] **Step 3: Commit**

```bash
git add functions/home_dynamic.js
git commit -m "feat(trending): TRENDING_WINDOW_DAYS 7→3 (반감기 3일과 정합)"
```

---

## Task 2: [P2-3] event_cache.js 모듈 생성

**Files:**
- Create: `functions/event_cache.js`

- [x] **Step 1: Write failing test**

```js
// functions/event_cache.test.js
const test = require('node:test');
const assert = require('node:assert');

// Minimal mock db
function makeDb(activeDocs = {}) { ... }
// Test: cache miss → reads Firestore; cache hit → skips
// Test: invalidate forces re-read
// Test: rebuildActiveBooksCache writes correct sets
```

- [x] **Step 2: Implement event_cache.js**

```js
// event_cache.js
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
let _cache = null;
let _expiry = 0;

async function getActiveBooks(db) { ... }
function invalidateActiveBooksCache() { _cache = null; _expiry = 0; }
async function rebuildActiveBooksCache(db, admin) { ... }

module.exports = { getActiveBooks, invalidateActiveBooksCache, rebuildActiveBooksCache };
```

- [x] **Step 3: Run tests**

```bash
cd functions && node --test event_cache.test.js
```

- [x] **Step 4: Commit**

---

## Task 3: [P2-3] index.js에 캐시 연결

**Files:**
- Modify: `functions/index.js`

- [x] **Step 1: import event_cache and use in trigger**

In `add_time_read_time_logs`:
```js
const { book_id } = newValue;
const activeBooks = await getActiveBooks(db);
if (!activeBooks.time.has(book_id) && !activeBooks.limit.has(book_id)) {
  // 비활성 책: 이벤트 조회 스킵
} else {
  await updateTimeEvent(...);
  await updateLimitEvent(...);
}
```

- [x] **Step 2: Call rebuildActiveBooksCache in daily_job**

Add at start of daily_job: `await rebuildActiveBooksCache(db, admin);`

- [x] **Step 3: Add refresh_active_books HTTPS endpoint**

- [x] **Step 4: Run full test suite and commit**

---

## Task 4: [P3-1] read_time_logs에 expireAt 추가

**Files:**
- Modify: `functions/index.js` (add_time_read_time_logs trigger)
- Create: `scripts/backfill_expire_at.js`

- [x] **Step 1: Modify trigger to set expireAt**

```js
const RETENTION_DAYS = 90;
// At end of trigger (after event updates):
const docData = snap.data();
const needsCreatedAt = !('createdAt' in docData);
const needsExpireAt = !('expireAt' in docData);
if (!needsCreatedAt && !needsExpireAt) return snap;
const updates = {};
if (needsCreatedAt) updates.createdAt = context.timestamp;
if (needsExpireAt) {
  const base = needsCreatedAt ? context.timestamp : docData.createdAt;
  const baseDate = base && typeof base.toDate === 'function' ? base.toDate() : new Date(base);
  const expire = new Date(baseDate.getTime() + RETENTION_DAYS * 86400000);
  updates.expireAt = admin.firestore.Timestamp.fromDate(expire);
}
return snap.ref.set(updates, { merge: true });
```

- [x] **Step 2: Create backfill_expire_at.js** (DO NOT RUN)

- [x] **Step 3: Commit**

---

## Task 5: [P2-2] 일별 독자수 집계 인프라 (partial)

**Files:**
- Modify: `functions/index.js` (updateReadTimeLog)
- Modify: `functions/home_dynamic.js` (add aggregateReadersFromDailyDocs)
- Modify: `functions/home_dynamic.test.js` (add tests)

- [x] **Step 1: Extend updateReadTimeLog**

Add `dayly_reader_count/{date}` write: `{ reader_count: { [book_id]: N } }`

- [x] **Step 2: Add aggregateReadersFromDailyDocs to home_dynamic.js**

```js
// Pure function: given N daily docs, return same shape as aggregateReaders output.
// KNOWN LIMITATION: cross-day user deduplication is approximate (users counted once per day).
async function aggregateReadersFromDailyDocs(db, now, windowDays, opts = {}) { ... }
```

- [x] **Step 3: Add tests showing equivalence + limitation**

- [x] **Step 4: Commit**

---

## Task 6: [P3-3] Storage Cache-Control 헤더

**Files:**
- Modify: `scripts/upload_gongu_books.js`
- Create: `scripts/backfill_storage_cache_headers.js`

- [x] **Step 1: Add cacheControl to upload calls**

```js
// In uploadWithToken:
metadata: {
  contentType,
  cacheControl: 'public, max-age=2592000',
  metadata: { firebaseStorageDownloadTokens: token },
}
// In epub upload:
metadata: { contentType: 'application/epub+zip', cacheControl: 'public, max-age=2592000' }
```

- [x] **Step 2: Create backfill script** (DO NOT RUN)

- [x] **Step 3: Commit**

---

## Risks & Limitations

### P2-2 (가장 위험)
- **Cross-day deduplication**: `aggregateReadersFromDailyDocs`에서 같은 사용자가 여러 날 읽으면 하루씩 별도 카운트 → `reader_count`와 `weighted_readers` 모두 과다 집계.
- **권고**: 1주일 병행 실행 후 결과 비교 전까지 `generateHomeDynamic` 교체 금지.

### P2-3
- **신규 이벤트 반영 지연**: 외부(Firebase Console)에서 새 이벤트를 만들면 다음 `daily_job`(자정) 실행 전까지 캐시에 반영 안 됨 → 그 사이 발생한 독서 기록이 이벤트에 집계되지 않음.
- **완화**: `refresh_active_books` HTTPS 엔드포인트로 즉시 수동 갱신 가능.
- **limit_event 만료 자동 감지 없음**: `is_active` 수동 전환 시에만 캐시에서 제거됨 (daily_job 재빌드로 보정).
