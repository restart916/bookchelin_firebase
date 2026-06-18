# Automatic Home Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dynamic carousel's `main_books` rotation with five deterministic daily automatic selections plus position-controlled optional pins, while preserving `main_books` for legacy apps.

**Architecture:** Keep all selection and merge rules as pure functions in `functions/home_dynamic.js`, then let `generateHomeDynamic()` orchestrate Firestore reads and one atomic batch write. A v1 Firestore `onWrite` trigger regenerates immediately when a pin changes. The existing Vue 2 `/edit-main-book` screen becomes a pin manager and read-only final-carousel preview; mobile clients and the `home_dynamic/current` shape remain unchanged.

**Tech Stack:** Node.js 20, CommonJS, `node:test`, Firebase Functions v1, Firestore Admin SDK, Vue 2.6, Firebase Web SDK 5, Vuefire.

## Global Constraints

- Do not migrate any Cloud Function to Firebase Functions v2.
- Do not modify or delete `main_books`; old clients continue to read it and dynamic clients retain their existing fallback.
- Keep `home_dynamic/current.carousel` as an ordered array of book ID strings.
- Always keep five automatic books when at least five eligible books exist; active pins are additional.
- Deduplicate in this priority: active pin > trending > discover > automatic carousel.
- Use KST `YYYY-MM-DD` strings for pin activation dates; both start and end dates are inclusive.
- Do not add mobile-client changes or personalized first-slide behavior.
- Use `apply_patch` for source edits and preserve unrelated working-tree changes.
- For Firebase CLI commands, use Node 20 or newer. Do not deploy production from this plan without an explicit deployment confirmation.

## File Structure

- Modify `functions/home_dynamic.js`: pure pin/date/selection/merge helpers and Firestore orchestration.
- Modify `functions/home_dynamic.test.js`: all pure rules and fake-Firestore integration coverage.
- Modify `functions/index.js`: v1 `home_carousel_pins/{pinId}` regeneration trigger.
- Replace `vue-project/src/views/EditMainBookView.vue`: pin CRUD, ordering, validation, polling, and final preview.
- Modify `vue-project/src/views/components/Header.vue`: rename the legacy menu label.
- Reference `docs/superpowers/specs/2026-06-18-automatic-home-carousel-design.md`: accepted behavior and rollout constraints.

---

### Task 1: Pure Pin Activation and Position Merge

**Files:**
- Modify: `functions/home_dynamic.js:209-236`
- Modify: `functions/home_dynamic.test.js` after the existing `selectDiscover` tests

**Interfaces:**
- Produces: `activePins(pinRows, dateString, visibleBookIds) -> Array<{id, book_id, position}>`
- Produces: `mergeCarouselPins(autoIds, pins) -> string[]`
- Consumes later: Task 3 calls both functions from `generateHomeDynamic()`.

- [ ] **Step 1: Write failing tests for active-date filtering and sanitization**

Add tests equivalent to:

```js
test('activePins: 활성·기간·가시성·책중복을 검증하고 위치순으로 정렬', () => {
  const rows = [
    { id: 'p2', book_id: 'B', position: 4, is_active: true, start_date: '2026-06-01' },
    { id: 'p1', book_id: 'A', position: 1, is_active: true, end_date: '2026-06-18' },
    { id: 'dup', book_id: 'A', position: 2, is_active: true },
    { id: 'future', book_id: 'C', position: 3, is_active: true, start_date: '2026-06-19' },
    { id: 'hidden', book_id: 'H', position: 5, is_active: true },
    { id: 'off', book_id: 'D', position: 6, is_active: false },
  ];
  assert.deepStrictEqual(
    hd.activePins(rows, '2026-06-18', ['A', 'B', 'C', 'D']),
    [
      { id: 'p1', book_id: 'A', position: 1 },
      { id: 'p2', book_id: 'B', position: 4 },
    ]
  );
});
```

- [ ] **Step 2: Write failing tests for final-position merging**

```js
test('mergeCarouselPins: 핀 위치를 먼저 채우고 자동책 5권을 빈칸에 유지', () => {
  const merged = hd.mergeCarouselPins(
    ['a1', 'a2', 'a3', 'a4', 'a5'],
    [
      { id: 'p1', book_id: 'P1', position: 1 },
      { id: 'p2', book_id: 'P2', position: 4 },
    ]
  );
  assert.deepStrictEqual(merged, ['P1', 'a1', 'a2', 'P2', 'a3', 'a4', 'a5']);
});

test('mergeCarouselPins: 충돌·범위초과·중복책을 결정적으로 보정', () => {
  const merged = hd.mergeCarouselPins(
    ['a1', 'P1', 'a2', 'a3', 'a4'],
    [
      { id: 'first', book_id: 'P1', position: 99 },
      { id: 'second', book_id: 'P2', position: 99 },
      { id: 'duplicate', book_id: 'P1', position: 1 },
    ]
  );
  assert.strictEqual(new Set(merged).size, merged.length);
  assert.strictEqual(merged.length, 6); // 고유 핀 2 + 핀과 겹치지 않는 자동 4
  assert.deepStrictEqual(merged.slice(-2), ['P1', 'P2']);
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
cd functions && node --test --test-name-pattern='activePins|mergeCarouselPins' home_dynamic.test.js
```

Expected: FAIL because the exported functions do not exist.

- [ ] **Step 4: Implement the minimal pure helpers**

Add implementations with these rules:

```js
function activePins(pinRows, dateString, visibleBookIds) {
  const visible = new Set(visibleBookIds);
  const seenBooks = new Set();
  return pinRows
    .filter((p) => p && p.is_active === true && typeof p.book_id === 'string')
    .filter((p) => !p.start_date || p.start_date <= dateString)
    .filter((p) => !p.end_date || p.end_date >= dateString)
    .filter((p) => visible.has(p.book_id))
    .sort((a, b) =>
      (Number(a.position) || Number.MAX_SAFE_INTEGER) -
        (Number(b.position) || Number.MAX_SAFE_INTEGER) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
      String(a.id).localeCompare(String(b.id))
    )
    .filter((p) => {
      if (seenBooks.has(p.book_id)) return false;
      seenBooks.add(p.book_id);
      return true;
    })
    .map((p) => ({
      id: p.id,
      book_id: p.book_id,
      position: Math.max(1, Number(p.position) || Number.MAX_SAFE_INTEGER),
    }));
}

function mergeCarouselPins(autoIds, pins) {
  const pinBookIds = new Set();
  const uniquePins = [];
  for (const pin of pins) {
    if (!pin || !pin.book_id || pinBookIds.has(pin.book_id)) continue;
    pinBookIds.add(pin.book_id);
    uniquePins.push(pin);
  }
  const autos = [...new Set(autoIds)].filter((id) => !pinBookIds.has(id));
  const size = uniquePins.length + autos.length;
  const slots = new Array(size);
  for (const pin of uniquePins) {
    let index = Math.min(Math.max(1, pin.position || size), size) - 1;
    while (index < size && slots[index]) index += 1;
    if (index >= size) index = slots.findIndex((v) => !v);
    slots[index] = pin.book_id;
  }
  let autoIndex = 0;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) slots[i] = autos[autoIndex++];
  }
  return slots.filter(Boolean);
}
```

Export both functions from `module.exports`.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
cd functions && node --test --test-name-pattern='activePins|mergeCarouselPins' home_dynamic.test.js
cd functions && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add functions/home_dynamic.js functions/home_dynamic.test.js
git commit -m "feat(home): add carousel pin merge rules"
```

---

### Task 2: Deterministic Five-Role Automatic Selection

**Files:**
- Modify: `functions/home_dynamic.js` after `mergeCarouselPins`
- Modify: `functions/home_dynamic.test.js` after Task 1 tests

**Interfaces:**
- Produces: `selectAutomaticCarousel(opts) -> string[]`
- Produces: `buildCarouselExposureState(previous, selectedIds, visibleIds, dayIndex) -> object`
- `opts.books`: `Array<{id, category, order, image_url}>`
- `opts.aggregates`: existing `aggregateReaders()` output
- `opts.rankedTrending`: existing `rankTrending()` output before cooldown selection
- `opts.excludedIds`: pin + trending + discover IDs
- `opts.previousExposure`: `{[bookId]: dayIndex}`
- Consumes later: Task 3 generator integration.

- [ ] **Step 1: Write a failing role-selection test**

Create a fixture with at least 12 visible covered books across two categories and aggregates for rising/steady books. Assert:

```js
test('selectAutomaticCarousel: 역할순 5권, 제외·쿨다운·중복 없음', () => {
  const books = [
    { id: 'rise', category: '1', order: 5, image_url: 'x' },
    { id: 'steady', category: '1', order: 4, image_url: 'x' },
    { id: 'category', category: '2', order: 99, image_url: 'x' },
    { id: 'dormant', category: '2', order: 3, image_url: 'x' },
    { id: 'explore', category: '3', order: 2, image_url: 'x' },
    { id: 'cool', category: '3', order: 100, image_url: 'x' },
    { id: 'trend', category: '1', order: 1, image_url: 'x' },
    { id: 'discover', category: '1', order: 1, image_url: 'x' },
    { id: 'pin', category: '1', order: 1, image_url: 'x' },
  ];
  const out = hd.selectAutomaticCarousel({
    books,
    aggregates: [
      { book_id: 'rise', reader_count: 3, weighted_readers: 3, total_read_time: 30 },
      { book_id: 'steady', reader_count: 1, weighted_readers: 1, total_read_time: 500 },
    ],
    rankedTrending: [{ book_id: 'rise', reader_count: 3, weighted_readers: 3, total_read_time: 30 }],
    excludedIds: ['trend', 'discover', 'pin'],
    previousExposure: { cool: 100 },
    dayIndex: 105,
    cooldownDays: 14,
    limit: 5,
  });
  assert.strictEqual(out.length, 5);
  assert.strictEqual(out[0], 'rise');
  assert.strictEqual(out[1], 'steady');
  assert.ok(!out.includes('cool'));
  assert.ok(!out.includes('trend'));
  assert.strictEqual(new Set(out).size, 5);
});
```

- [ ] **Step 2: Write failing tests for cooldown fallback and state pruning**

```js
test('selectAutomaticCarousel: 쿨다운 후보가 부족하면 오래된 순으로 완화해 5권 충원', () => {
  const books = Array.from({ length: 5 }, (_, i) => ({
    id: `b${i}`, category: String(i % 2), order: i, image_url: 'x',
  }));
  const out = hd.selectAutomaticCarousel({
    books,
    aggregates: [],
    rankedTrending: [],
    excludedIds: [],
    previousExposure: { b0: 99, b1: 98, b2: 97, b3: 96, b4: 95 },
    dayIndex: 100,
    cooldownDays: 14,
    limit: 5,
  });
  assert.deepStrictEqual(new Set(out), new Set(['b0', 'b1', 'b2', 'b3', 'b4']));
});

test('buildCarouselExposureState: 현재 책만 보존하고 선택책은 오늘로 갱신', () => {
  assert.deepStrictEqual(
    hd.buildCarouselExposureState({ old: 1, keep: 5 }, ['new'], ['keep', 'new'], 10),
    { keep: 5, new: 10 }
  );
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

```bash
cd functions && node --test --test-name-pattern='selectAutomaticCarousel|buildCarouselExposureState' home_dynamic.test.js
```

Expected: FAIL because the functions are not exported.

- [ ] **Step 4: Implement role selection with small private helpers**

Implement `selectAutomaticCarousel()` so it:

1. Builds eligible covered books (`hidden` filtering already happened in the query).
2. Applies the 14-day cooldown before role selection.
3. Picks rising from `rankedTrending` order.
4. Picks steady by `total_read_time DESC`, `reader_count DESC`, `book_id ASC`.
5. Picks a KST-day category using sorted distinct category IDs and chooses `order DESC`, oldest exposure, ID.
6. Picks dormant from books absent in the aggregate map, oldest exposure first.
7. Picks exploration from remaining IDs using the existing deterministic day-window arithmetic.
8. Fills missing slots from all remaining candidates by oldest exposure then ID, first respecting cooldown and then relaxing it.

Use a single `take(id)` closure backed by a `Set` so no role can duplicate a prior role. Return only IDs, in role order.

Implement state update exactly as:

```js
function buildCarouselExposureState(previous, selectedIds, visibleIds, dayIndex) {
  const visible = new Set(visibleIds);
  const next = {};
  for (const [id, shownDay] of Object.entries(previous || {})) {
    if (visible.has(id) && typeof shownDay === 'number') next[id] = shownDay;
  }
  for (const id of selectedIds) next[id] = dayIndex;
  return next;
}
```

Export both public functions.

- [ ] **Step 5: Run focused tests, then the full Functions suite**

```bash
cd functions && node --test --test-name-pattern='selectAutomaticCarousel|buildCarouselExposureState' home_dynamic.test.js
cd functions && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add functions/home_dynamic.js functions/home_dynamic.test.js
git commit -m "feat(home): select five daily carousel books"
```

---

### Task 3: Integrate Pins, Global Deduplication, and Carousel State

**Files:**
- Modify: `functions/home_dynamic.js:238-342`
- Modify: `functions/home_dynamic.test.js` fake DB and generator tests

**Interfaces:**
- Consumes: `activePins`, `mergeCarouselPins`, `selectAutomaticCarousel`, `buildCarouselExposureState` from Tasks 1-2.
- Produces: unchanged `generateHomeDynamic(db, now)` result and unchanged `home_dynamic/current` public shape.
- Writes: `home_dynamic/_carousel_state` with `{updated_at, day, baseline, last_shown_day_by_book}`.

- [ ] **Step 1: Extend fake Firestore for pins and carousel state**

Change `makeFakeDb()` to accept:

```js
function makeFakeDb({
  readTimeLogs = [], books = [], mainBooks = [], carouselPins = [], docs = {},
}) {
  const cols = {
    read_time_logs: readTimeLogs,
    books,
    main_books: mainBooks,
    home_carousel_pins: carouselPins,
  };
  // Keep the existing doc().get() and batch().set() behavior.
}
```

Ensure collection snapshots retain each row's `id` and return `{id, ...data()}` to the generator when requested.

- [ ] **Step 2: Replace the old generator expectation with a failing compatibility test**

Add one integration test whose fixture contains `mainBooks: [{book_id:'LEGACY'}]`, two active pins at positions 1 and 4, more than 20 visible covered books, and read logs. Assert:

```js
const home = db._writes['home_dynamic/current'];
assert.strictEqual(home.carousel.length, 7);
assert.strictEqual(home.carousel[0], 'PIN1');
assert.strictEqual(home.carousel[3], 'PIN2');
assert.ok(!home.carousel.includes('LEGACY'));
assert.strictEqual(new Set([
  ...home.carousel,
  ...home.trending.map((x) => x.book_id),
  ...home.discover,
]).size, home.carousel.length + home.trending.length + home.discover.length);
assert.ok(db._writes['home_dynamic/_carousel_state']);
```

Update the old test that expected carousel `['P']`; it must now expect five automatic IDs and prove `main_books` is untouched and ignored.

- [ ] **Step 3: Add a failing same-day idempotency test**

Seed `home_dynamic/_carousel_state` with `day` equal to today, a `baseline`, and a post-run `last_shown_day_by_book`. Run `generateHomeDynamic()` twice with identical input and assert both `carousel` arrays match. Then add a pin that duplicates one automatic book and assert only that slot is replaced while automatic count remains five where enough candidates exist.

- [ ] **Step 4: Run generator tests and verify failure**

```bash
cd functions && node --test --test-name-pattern='generateHomeDynamic' home_dynamic.test.js
```

Expected: FAIL because the generator still rotates `main_books`.

- [ ] **Step 5: Refactor `generateHomeDynamic()` orchestration**

Make these concrete changes in order:

1. Preserve full visible book data:

```js
const books = booksSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
const visibleIds = books.map((b) => b.id);
```

2. Replace the `main_books` read with:

```js
const pinSnap = await db.collection('home_carousel_pins').get();
const pins = activePins(
  pinSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })),
  kstDateString(now),
  visibleIds
);
const pinIds = pins.map((p) => p.book_id);
```

3. Exclude `pinIds` while ranking trending. Build discover from visible IDs excluding pins and selected trending, preserving its existing dormant-first logic.
4. Read `home_dynamic/_carousel_state`. For the same day use `baseline`; for a new day use `last_shown_day_by_book`:

```js
const carouselBaseline =
  carouselState.day === dayIndex
    ? (carouselState.baseline || {})
    : (carouselState.last_shown_day_by_book || {});
```

5. Select automatic books only after trending and discover are known:

```js
const automaticCarousel = selectAutomaticCarousel({
  books,
  aggregates,
  rankedTrending: ranked,
  excludedIds: [...pinIds, ...trendingIds, ...discover],
  previousExposure: carouselBaseline,
  dayIndex,
  cooldownDays: 14,
  limit: 5,
});
const carousel = mergeCarouselPins(automaticCarousel, pins);
```

6. Batch-write `_carousel_state` alongside the existing documents:

```js
batch.set(carouselStateRef, {
  updated_at: now,
  day: dayIndex,
  baseline: carouselBaseline,
  last_shown_day_by_book: buildCarouselExposureState(
    carouselBaseline,
    automaticCarousel,
    visibleIds,
    dayIndex
  ),
});
```

7. Remove the hidden-main-book title fallback because all pins and automatic books must be visible books already present in `titleById`.
8. Keep the returned `carousel` detailed list and the Firestore public shape unchanged.

- [ ] **Step 6: Run generator tests, full tests, and lint**

```bash
cd functions && node --test --test-name-pattern='generateHomeDynamic' home_dynamic.test.js
cd functions && npm test
cd functions && npm run lint
```

Expected: all tests PASS and ESLint exits 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add functions/home_dynamic.js functions/home_dynamic.test.js
git commit -m "feat(home): generate automatic pinned carousel"
```

---

### Task 4: Regenerate Immediately When Pins Change

**Files:**
- Modify: `functions/index.js:782-810`

**Interfaces:**
- Consumes: existing `generateHomeDynamic(db)`.
- Produces export: `regenerate_home_dynamic_on_pin_write` v1 Firestore trigger.

- [ ] **Step 1: Add the v1 trigger below `regenerate_home_dynamic`**

```js
exports.regenerate_home_dynamic_on_pin_write = functions.firestore
  .document('home_carousel_pins/{pinId}')
  .onWrite(async (change, context) => {
    const result = await generateHomeDynamic(db);
    console.log(
      'regenerate_home_dynamic_on_pin_write done',
      context.params.pinId,
      result.date,
      result.carousel.length
    );
    return null;
  });
```

Do not send Discord messages from this trigger; manual pin editing must not create channel noise.

- [ ] **Step 2: Run lint and the full Functions tests**

```bash
cd functions && npm run lint
cd functions && npm test
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit Task 4**

```bash
git add functions/index.js
git commit -m "feat(home): regenerate carousel after pin changes"
```

---

### Task 5: Replace the Legacy Admin Screen with Pin Management

**Files:**
- Replace: `vue-project/src/views/EditMainBookView.vue`
- Modify: `vue-project/src/views/components/Header.vue:6`

**Interfaces:**
- Reads collection: `books` ordered by `title`.
- Reads collection: `home_carousel_pins` ordered by `position`.
- Reads document on demand: `home_dynamic/current`.
- Writes pin fields: `{book_id, position, is_active, start_date, end_date, created_at, updated_at}`.

- [ ] **Step 1: Replace Vuefire bindings and component state**

Use collection bindings only:

```js
firestore () {
  return {
    books: firestore.collection('books').orderBy('title', 'asc'),
    pins: firestore.collection('home_carousel_pins').orderBy('position', 'asc')
  }
},
data () {
  return {
    editingId: '',
    bookSearch: '',
    selectedBookId: '',
    position: 1,
    isActive: true,
    startDate: '',
    endDate: '',
    finalCarousel: [],
    previewBooks: {},
    saving: false,
    refreshStatus: ''
  }
}
```

Computed properties must:

- filter `books` by case-insensitive title and `hidden !== true`;
- expose active pins in position order;
- map book IDs to titles and covers;
- calculate the allowed maximum position as `activePins.length + 6` while creating (new pin + five automatic books) and `activePins.length + 5` while editing.

- [ ] **Step 2: Implement explicit validation**

Add `validateForm()` returning a Korean error string or `''`:

```js
validateForm () {
  const book = this.books.find(b => b['.key'] === this.selectedBookId)
  if (!book || book.hidden === true) return '노출 가능한 책을 선택해주세요.'
  if (!Number.isInteger(Number(this.position)) || Number(this.position) < 1) {
    return '위치는 1 이상의 정수여야 합니다.'
  }
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    return '종료일은 시작일보다 빠를 수 없습니다.'
  }
  const collision = this.pins.find(p =>
    p['.key'] !== this.editingId && p.is_active === true &&
    Number(p.position) === Number(this.position)
  )
  if (this.isActive && collision) return '같은 위치에 활성 핀이 이미 있습니다.'
  const duplicate = this.pins.find(p =>
    p['.key'] !== this.editingId && p.is_active === true &&
    p.book_id === this.selectedBookId
  )
  if (this.isActive && duplicate) return '같은 책의 활성 핀이 이미 있습니다.'
  return ''
}
```

- [ ] **Step 3: Implement CRUD without image uploads**

Use Firestore server timestamps from SDK 5:

```js
async savePin () {
  const error = this.validateForm()
  if (error) { window.alert(error); return }
  this.saving = true
  const before = Date.now()
  const data = {
    book_id: this.selectedBookId,
    position: Number(this.position),
    is_active: this.isActive,
    start_date: this.startDate || null,
    end_date: this.endDate || null,
    updated_at: new Date()
  }
  try {
    if (this.editingId) {
      await firestore.collection('home_carousel_pins').doc(this.editingId).update(data)
    } else {
      data.created_at = new Date()
      await firestore.collection('home_carousel_pins').add(data)
    }
    this.clearForm()
    await this.waitForCarouselRefresh(before)
  } finally {
    this.saving = false
  }
}
```

Implement `deletePin(id)` with `window.confirm`, delete the document, and call the same refresh poll. Implement `editPin(pin)` and `clearForm()`.

- [ ] **Step 4: Implement position movement as a batch swap**

`movePin(pin, direction)` finds the previous/next active pin by position, then uses `firestore.batch()` to swap their integer positions and update timestamps. If there is no neighbor, do nothing. Poll `home_dynamic/current` after commit.

Do not rewrite all pin documents; swapping exactly two avoids unnecessary onWrite fan-out.

- [ ] **Step 5: Implement the final-carousel poll and preview**

```js
async loadFinalCarousel () {
  const snap = await firestore.collection('home_dynamic').doc('current').get()
  const data = snap.exists ? snap.data() : {}
  this.finalCarousel = Array.isArray(data.carousel) ? data.carousel : []
  return data.updated_at && data.updated_at.toMillis
    ? data.updated_at.toMillis()
    : 0
},
async waitForCarouselRefresh (afterMs) {
  this.refreshStatus = '편성 갱신 중…'
  for (let i = 0; i < 10; i++) {
    const updatedAt = await this.loadFinalCarousel()
    if (updatedAt >= afterMs) {
      this.refreshStatus = '편성 갱신 완료'
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  this.refreshStatus = '핀은 저장됨 · 편성 갱신 대기'
}
```

Call `loadFinalCarousel()` from `mounted()`.

- [ ] **Step 6: Build the replacement template**

The template must contain:

- heading `홈 상단 관리`;
- explanation `수동 핀은 자동 선정 5권에 추가됩니다`;
- searchable visible-book picker with cover/title;
- position number input plus inclusive start/end date inputs;
- active checkbox and save/cancel controls;
- pin table with position, cover, title, dates, active state, up/down, edit, delete;
- read-only final preview ordered exactly as `finalCarousel`, with numbered cards;
- no file input and no `firestorage` import.

Use `window.alert`/`window.confirm` explicitly because the project ESLint rule only rejects bare global calls.

- [ ] **Step 7: Rename the menu label**

Change only the visible text in `Header.vue`:

```html
<router-link to="/edit-main-book">홈 상단 관리</router-link>
```

- [ ] **Step 8: Install legacy dependencies only if absent, then build**

```bash
cd vue-project && npm install --ignore-scripts
cd vue-project && npm run build
```

Expected: production build completes successfully. Existing dependency warnings are allowed; compile errors are not.

- [ ] **Step 9: Commit Task 5**

```bash
git add vue-project/src/views/EditMainBookView.vue vue-project/src/views/components/Header.vue
git commit -m "feat(admin): manage home carousel pins"
```

---

### Task 6: Full Verification and Deployment Readiness

**Files:**
- Verify only; modify prior task files only if a failing check reveals a defect.

**Interfaces:**
- Verifies all public behavior from the accepted design.

- [ ] **Step 1: Run all automated verification**

```bash
cd functions && npm test
cd functions && npm run lint
cd vue-project && npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect the final diff for forbidden changes**

```bash
git diff master...HEAD -- functions/home_dynamic.js functions/home_dynamic.test.js functions/index.js vue-project/src/views/EditMainBookView.vue vue-project/src/views/components/Header.vue
git diff master...HEAD --name-only
```

Verify manually:

- no mobile repositories changed;
- no write to or deletion from `main_books` was introduced;
- no Functions v2 import was introduced;
- `home_dynamic/current.carousel` remains a string array;
- automatic count remains five before pins are merged;
- no unrelated untracked user files are staged.

- [ ] **Step 3: Run a local pure-function smoke sample**

```bash
cd functions && node - <<'NODE'
const hd = require('./home_dynamic');
const merged = hd.mergeCarouselPins(
  ['a1', 'a2', 'a3', 'a4', 'a5'],
  [{ id: 'p1', book_id: 'P1', position: 1 }, { id: 'p2', book_id: 'P2', position: 4 }]
);
console.log(JSON.stringify(merged));
NODE
```

Expected:

```text
["P1","a1","a2","P2","a3","a4","a5"]
```

- [ ] **Step 4: Record production deployment commands but stop for confirmation**

After explicit user confirmation, use Node 20+ and deploy only scoped targets:

```bash
firebase deploy --only functions:daily_job,functions:regenerate_home_dynamic,functions:regenerate_home_dynamic_on_pin_write
cd vue-project && npm run build && cd .. && firebase deploy --only hosting
```

Never use `vue-project`'s `npm run deploy`, because it deploys every Firebase target.

- [ ] **Step 5: Post-deploy production verification after confirmation**

1. Invoke `regenerate_home_dynamic?notify=0` once.
2. Read `home_dynamic/current` and confirm exactly five carousel IDs when no pins are active.
3. Add temporary pins at positions 1 and 4 in the admin and confirm seven IDs in final order.
4. Confirm `main_books` document count and contents did not change.
5. Delete the temporary pins and confirm the carousel returns to five IDs.
6. Inspect recent function logs for `regenerate_home_dynamic_on_pin_write done` and absence of errors.
