const test = require('node:test');
const assert = require('node:assert');
const hd = require('./home_dynamic');

test('kstDateString: UTC 저녁은 KST 다음날로 넘어간다', () => {
  // 2026-06-07T20:00Z == 2026-06-08 05:00 KST
  assert.strictEqual(hd.kstDateString(new Date('2026-06-07T20:00:00Z')), '2026-06-08');
  // 2026-06-07T01:00Z == 2026-06-07 10:00 KST
  assert.strictEqual(hd.kstDateString(new Date('2026-06-07T01:00:00Z')), '2026-06-07');
});

test('kstDayIndex: 하루마다 정확히 1씩 증가한다', () => {
  const a = hd.kstDayIndex(new Date('2026-06-07T01:00:00Z')); // KST 06-07
  const b = hd.kstDayIndex(new Date('2026-06-08T01:00:00Z')); // KST 06-08
  assert.strictEqual(b - a, 1);
});

test('aggregateReaders: book_id별 distinct 유저수와 총 read_time 집계', () => {
  const logs = [
    { book_id: 'A', user_uid: 'u1', read_time: 10 },
    { book_id: 'A', user_uid: 'u1', read_time: 5 }, // 같은 유저 → reader_count 1
    { book_id: 'A', user_uid: 'u2', read_time: 20 },
    { book_id: 'B', user_uid: 'u3', read_time: 7 },
    { book_id: undefined, user_uid: 'u9', read_time: 99 }, // book_id 없으면 무시
  ];
  const out = hd.aggregateReaders(logs);
  const a = out.find((x) => x.book_id === 'A');
  const b = out.find((x) => x.book_id === 'B');
  assert.strictEqual(a.reader_count, 2);
  assert.strictEqual(a.total_read_time, 35);
  assert.strictEqual(b.reader_count, 1);
  assert.strictEqual(out.length, 2);
});

test('selectTrending: 가시·핀제외·최소독자 필터 후 독자수 desc 정렬, limit 적용', () => {
  const agg = [
    { book_id: 'A', reader_count: 13, total_read_time: 100 },
    { book_id: 'B', reader_count: 13, total_read_time: 200 }, // 동점 → read_time desc로 B가 앞
    { book_id: 'C', reader_count: 1, total_read_time: 999 }, // minReaders 미달 제외
    { book_id: 'P', reader_count: 50, total_read_time: 999 }, // 핀이라 제외
    { book_id: 'H', reader_count: 9, total_read_time: 10 }, // hidden(비가시) 제외
  ];
  const out = hd.selectTrending(agg, {
    visibleIds: ['A', 'B', 'C', 'P'], // H는 비가시
    excludeIds: ['P'],
    minReaders: 2,
    limit: 8,
  });
  // 입력 aggregate 에 weighted_readers 가 없으면 reader_count 로 폴백 → 동점, read_time desc 로 B 먼저.
  assert.deepStrictEqual(out, [
    { book_id: 'B', reader_count: 13, weighted_readers: 13, total_read_time: 200 },
    { book_id: 'A', reader_count: 13, weighted_readers: 13, total_read_time: 100 },
  ]);
});

test('aggregateReaders: 시간 감쇠 — 최근 로그가 가중 독자 점수를 더 키운다', () => {
  const now = new Date('2026-06-10T00:00:00Z');
  // u1: 오늘(가중치 1), u2: 3일 전(반감기3 → 0.5). weighted = 1.5, 실측 reader_count = 2.
  const logs = [
    { book_id: 'A', user_uid: 'u1', read_time: 10, createdAt: '2026-06-10T00:00:00Z' },
    { book_id: 'A', user_uid: 'u2', read_time: 10, createdAt: '2026-06-07T00:00:00Z' },
    // u1 의 더 오래된 중복 로그 → user 당 '최대 가중치'만 반영하므로 weighted 에 영향 없음.
    { book_id: 'A', user_uid: 'u1', read_time: 5, createdAt: '2026-06-01T00:00:00Z' },
  ];
  const a = hd.aggregateReaders(logs, now, { halfLife: 3 }).find((x) => x.book_id === 'A');
  assert.strictEqual(a.reader_count, 2); // 실측 고유 독자
  assert.ok(Math.abs(a.weighted_readers - 1.5) < 1e-9); // 1(u1) + 0.5(u2)
});

test('selectDiscover: 날짜 인덱스 슬라이딩 윈도우(랩어라운드)', () => {
  const pool = ['a', 'b', 'c', 'd', 'e']; // 5개
  assert.deepStrictEqual(hd.selectDiscover({ pool, dayIndex: 0, window: 3 }), ['a', 'b', 'c']);
  // start = (1*3) % 5 = 3 → d, e, a
  assert.deepStrictEqual(hd.selectDiscover({ pool, dayIndex: 1, window: 3 }), ['d', 'e', 'a']);
  // window가 풀보다 크면 풀 크기만큼만
  assert.deepStrictEqual(hd.selectDiscover({ pool: ['x', 'y'], dayIndex: 9, window: 10 }).length, 2);
  // 빈 풀
  assert.deepStrictEqual(hd.selectDiscover({ pool: [], dayIndex: 3, window: 10 }), []);
});

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
  assert.strictEqual(merged.length, 6);
  assert.deepStrictEqual(merged, ['P2', 'a1', 'a2', 'a3', 'a4', 'P1']);
});

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
    rankedTrending: [
      { book_id: 'rise', reader_count: 3, weighted_readers: 3, total_read_time: 30 },
    ],
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

test('selectAutomaticCarousel: 쿨다운 후보가 부족하면 오래된 순으로 완화해 5권 충원', () => {
  const books = Array.from({ length: 5 }, (_, i) => ({
    id: `b${i}`,
    category: String(i % 2),
    order: i,
    image_url: 'x',
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

test('buildAutoSuggestDocs: order "0"/"00", auto:true, 제목/books 매핑', () => {
  const trending = [{ book_id: 'A', reader_count: 5 }, { book_id: 'B', reader_count: 3 }];
  const discover = ['x', 'y', 'z'];
  const docs = hd.buildAutoSuggestDocs(trending, discover);
  assert.deepStrictEqual(docs._auto_trending, {
    auto: true, order: '0', title: '지금 인기', books: ['A', 'B'],
  });
  assert.deepStrictEqual(docs._auto_discover, {
    auto: true, order: '00', title: '오늘의 발견', books: ['x', 'y', 'z'],
  });
});

function makeFakeDb({
  readTimeLogs = [],
  books = [],
  mainBooks = [],
  carouselPins = [],
  docs = {},
}) {
  const writes = {};
  const cols = {
    read_time_logs: readTimeLogs,
    books,
    main_books: mainBooks,
    home_carousel_pins: carouselPins,
  };
  const snap = (arr) => ({
    docs: arr.map((r) => ({ id: r.id, data: () => r })),
    size: arr.length,
  });
  return {
    _writes: writes,
    collection(name) {
      return {
        where(field, op, val) {
          const arr = (cols[name] || []).filter((r) => {
            if (op === '>=') return r[field] >= val;
            if (op === '==') return r[field] === val;
            return true;
          });
          return { get: async () => snap(arr) };
        },
        get: async () => snap(cols[name] || []),
        doc(id) {
          const ref = name + '/' + id;
          return {
            _ref: ref,
            async get() {
              const has = Object.prototype.hasOwnProperty.call(docs, ref);
              return { exists: has, data: () => (has ? docs[ref] : undefined) };
            },
          };
        },
      };
    },
    batch() {
      return {
        set(ref, data) {
          writes[ref._ref] = data;
        },
        async commit() {},
      };
    },
  };
}

test('generateHomeDynamic: 집계→선정→home_dynamic/current + 자동행 2개 기록', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const recent = '2026-06-05T00:00:00Z';
  const fillers = Array.from({ length: 15 }, (_, i) => ({
    id: `D${String(i + 1).padStart(2, '0')}`,
    hidden: false,
    image_url: 'https://example.com/cover.png',
    category: String((i % 3) + 1),
    order: i,
  }));
  const db = makeFakeDb({
    readTimeLogs: [
      { id: 'l1', book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: recent },
      { id: 'l2', book_id: 'A', user_uid: 'u2', read_time: 30, createdAt: recent },
      { id: 'l3', book_id: 'P', user_uid: 'u3', read_time: 99, createdAt: recent },
      { id: 'l4', book_id: 'A', user_uid: 'u4', read_time: 1, createdAt: '2020-01-01T00:00:00Z' },
    ],
    books: [
      { id: 'A', title: '인기책', hidden: false, image_url: 'a', category: '1', order: 1 },
      { id: 'P', title: '핀책', hidden: false, image_url: 'p', category: '1', order: 2 },
      ...fillers,
      { id: 'HID', hidden: true, image_url: 'hidden' },
    ],
    mainBooks: [{ id: 'mb1', book_id: 'LEGACY' }],
    carouselPins: [
      { id: 'pin1', book_id: 'P', position: 1, is_active: true },
    ],
  });

  const result = await hd.generateHomeDynamic(db, now);

  const home = db._writes['home_dynamic/current'];
  assert.strictEqual(home.date, '2026-06-07');
  assert.strictEqual(home.carousel.length, 6); // 수동 핀 1 + 자동 5
  assert.strictEqual(home.carousel[0], 'P');
  assert.ok(!home.carousel.includes('LEGACY'));
  assert.deepStrictEqual(home.trending, [{ book_id: 'A', reader_count: 2 }]);
  assert.strictEqual(home.discover.length, 10);
  const allHomeIds = [
    ...home.carousel,
    ...home.trending.map((x) => x.book_id),
    ...home.discover,
  ];
  assert.strictEqual(new Set(allHomeIds).size, allHomeIds.length);
  assert.ok(db._writes['home_dynamic/_carousel_state']);

  const t = db._writes['suggest_group/_auto_trending'];
  const d = db._writes['suggest_group/_auto_discover'];
  assert.strictEqual(t.order, '0');
  assert.deepStrictEqual(t.books, ['A']);
  assert.strictEqual(d.order, '00');
  // 반환값은 제목/신규표시가 붙은 상세 리스트 (Firestore 문서 shape 와는 별개).
  assert.strictEqual(result.trending.length, 1);
  assert.strictEqual(result.trending[0].book_id, 'A');
  assert.strictEqual(result.trending[0].is_new, true);
  assert.strictEqual(result.carousel.length, 6);
});

test('formatCurationMessage: 섹션별 제목 목록 + 신규(🆕) 표시', () => {
  const msg = hd.formatCurationMessage({
    date: '2026-06-09',
    trending: [
      { book_id: 'A', title: '책가게', is_new: true },
      { book_id: 'B', title: '두번째책', is_new: false },
    ],
    discover: [{ book_id: 'D1', title: '발견책' }],
    carousel: [{ book_id: 'P', title: '핀책' }],
  });
  assert.ok(msg.includes('일간 큐레이션 갱신 — 2026-06-09'));
  assert.ok(msg.includes('🔥 지금 인기 (2)'));
  assert.ok(msg.includes('• 책가게  🆕')); // 신규 표시
  assert.ok(msg.includes('• 두번째책')); // 신규 아님 → 마커 없음
  assert.ok(!msg.includes('• 두번째책  🆕'));
  assert.ok(msg.includes('✨ 오늘의 발견 (1)'));
  assert.ok(msg.includes('• 발견책'));
  assert.ok(msg.includes('🎠 캐러셀 (1)'));
});

test('generateHomeDynamic: 숨김(hidden) 핀은 새 캐러셀에서 제외한다', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const db = makeFakeDb({
    readTimeLogs: [],
    books: [
      { id: 'D1', hidden: false, image_url: 'd1', category: '1' },
      { id: 'HID', hidden: true, image_url: 'hid', category: '1' },
    ],
    carouselPins: [
      { id: 'pin-hidden', book_id: 'HID', position: 1, is_active: true },
    ],
  });

  const result = await hd.generateHomeDynamic(db, now);

  assert.ok(!result.carousel.some((b) => b.book_id === 'HID'));
});

test('generateHomeDynamic: 같은 날 캐러셀 재실행은 멱등이고 핀 추가 후에도 자동 5권 유지', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const books = Array.from({ length: 20 }, (_, i) => ({
    id: `B${String(i).padStart(2, '0')}`,
    title: `책${i}`,
    hidden: false,
    image_url: `cover${i}`,
    category: String(i % 4),
    order: i,
  }));
  const db1 = makeFakeDb({ books });
  await hd.generateHomeDynamic(db1, now);
  const firstCarousel = db1._writes['home_dynamic/current'].carousel;
  const firstState = db1._writes['home_dynamic/_carousel_state'];
  assert.strictEqual(firstCarousel.length, 5);

  const db2 = makeFakeDb({
    books,
    docs: { 'home_dynamic/_carousel_state': firstState },
  });
  await hd.generateHomeDynamic(db2, now);
  assert.deepStrictEqual(db2._writes['home_dynamic/current'].carousel, firstCarousel);

  const pinnedBook = firstCarousel[0];
  const db3 = makeFakeDb({
    books,
    carouselPins: [
      { id: 'new-pin', book_id: pinnedBook, position: 1, is_active: true },
    ],
    docs: { 'home_dynamic/_carousel_state': firstState },
  });
  await hd.generateHomeDynamic(db3, now);
  const withPin = db3._writes['home_dynamic/current'].carousel;
  assert.strictEqual(withPin.length, 6);
  assert.strictEqual(withPin[0], pinnedBook);
  assert.strictEqual(new Set(withPin).size, 6);
});

test('formatCurationMessage: 빈 섹션은 "(없음)", title 없으면 book_id 폴백', () => {
  const msg = hd.formatCurationMessage({
    date: '2026-06-09',
    trending: [],
    discover: [{ book_id: 'xyz' }], // title 없음
    carousel: [],
  });
  assert.ok(msg.includes('🔥 지금 인기 (0)'));
  assert.ok(msg.includes('• (없음)'));
  assert.ok(msg.includes('• xyz')); // book_id 폴백
});

// ---- 트렌딩 고착 방지(소프트 노출 패널티) 룰 ----

// weighted_readers 가 곧 base score. 없으면 reader_count 폴백.
const RANK = [
  { book_id: 'A', reader_count: 10, weighted_readers: 10, total_read_time: 0 },
  { book_id: 'B', reader_count: 9, weighted_readers: 9, total_read_time: 0 },
  { book_id: 'C', reader_count: 8, weighted_readers: 8, total_read_time: 0 },
];
const OPT = { exposurePenalty: 0.35, safetyMaxDaysShown: 5, safetyCooldownDays: 1 };

test('selectTrendingWithCooldown: 상태 없으면 점수 상위 limit개, days_shown=1로 시작', () => {
  const { selected, nextState } = hd.selectTrendingWithCooldown(RANK, {}, 100, {
    limit: 2,
    ...OPT,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['A', 'B']);
  assert.deepStrictEqual(nextState.A, { days_shown: 1 });
  assert.deepStrictEqual(nextState.B, { days_shown: 1 });
  assert.strictEqual(nextState.C, undefined); // 노출 안 됨 → 상태 없음
});

test('selectTrendingWithCooldown: 연속 노출 시 days_shown 누적', () => {
  // limit=3 으로 셋 다 노출(경쟁 배제) → 계속 노출되는 책의 days_shown 누적만 검증.
  const prev = { A: { days_shown: 1 }, B: { days_shown: 1 } };
  const { nextState } = hd.selectTrendingWithCooldown(RANK, prev, 101, { limit: 3, ...OPT });
  assert.deepStrictEqual(nextState.A, { days_shown: 2 });
  assert.deepStrictEqual(nextState.B, { days_shown: 2 });
  assert.deepStrictEqual(nextState.C, { days_shown: 1 }); // 신규
});

test('selectTrendingWithCooldown: 소프트 패널티 — 오래 노출된 책이 신규에게 서서히 밀린다', () => {
  // A,B 가 어제까지 2일 노출(days_shown=2). C 는 신규(0).
  //   effA = 10/(1+0.35*2)=5.88, effB = 9/1.7=5.29, effC = 8/1=8.
  //   → 정렬: C > A > B. limit 2 → [C, A] (B 가 한꺼번이 아니라 한 칸씩 밀려남).
  const prev = { A: { days_shown: 2 }, B: { days_shown: 2 } };
  const { selected, nextState } = hd.selectTrendingWithCooldown(RANK, prev, 102, {
    limit: 2,
    ...OPT,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['C', 'A']);
  assert.deepStrictEqual(nextState.C, { days_shown: 1 }); // 신규 진입
  assert.deepStrictEqual(nextState.A, { days_shown: 3 }); // 계속 노출 → 누적
  assert.strictEqual(nextState.B, undefined); // 이번 날 밀려남 → 리셋(상태 없음)
});

test('selectTrendingWithCooldown: 안전장치 — days_shown>=max 면 1일 강제 쿨다운', () => {
  const prev = { A: { days_shown: 5 } }; // safetyMaxDaysShown=5 도달
  const { selected, nextState } = hd.selectTrendingWithCooldown(RANK, prev, 300, {
    limit: 2,
    ...OPT,
  });
  assert.ok(!selected.some((c) => c.book_id === 'A')); // 이날 강제 제외
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['B', 'C']);
  // cooldownUntil = 300 + 1 - 1 = 300 → 그날만 제외, 다음날 재적격
  assert.deepStrictEqual(nextState.A, { days_shown: 0, cooldownUntil: 300 });
  const r = hd.selectTrendingWithCooldown(RANK, nextState, 301, { limit: 2, ...OPT });
  assert.ok(r.selected.some((c) => c.book_id === 'A')); // 다음날 복귀
});

test('selectTrendingWithCooldown: 쿨다운 중이면 제외', () => {
  const prev = { A: { days_shown: 0, cooldownUntil: 400 } };
  const r1 = hd.selectTrendingWithCooldown(RANK, prev, 400, { limit: 2, ...OPT });
  assert.ok(!r1.selected.some((c) => c.book_id === 'A')); // 400 <= 400 → 제외
  const r2 = hd.selectTrendingWithCooldown(RANK, prev, 401, { limit: 2, ...OPT });
  assert.ok(r2.selected.some((c) => c.book_id === 'A')); // 만료 → 복귀
});

test('selectTrendingWithCooldown: 안전장치 쿨다운 기본값(상수)은 3일 휴식', () => {
  // safetyCooldownDays 를 생략 → 상수 SAFETY_COOLDOWN_DAYS 사용. 5일 연속 후 3일 빠졌다 복귀.
  const OPT_CONST = { exposurePenalty: 0.35, safetyMaxDaysShown: 5 };
  const prev = { A: { days_shown: 5 } };
  const r0 = hd.selectTrendingWithCooldown(RANK, prev, 300, { limit: 2, ...OPT_CONST });
  assert.ok(!r0.selected.some((c) => c.book_id === 'A')); // 300: 강제 제외
  // cooldownUntil = 300 + 3 - 1 = 302 (3일짜리 쿨다운)
  assert.deepStrictEqual(r0.nextState.A, { days_shown: 0, cooldownUntil: 302 });

  const r1 = hd.selectTrendingWithCooldown(RANK, r0.nextState, 301, { limit: 2, ...OPT_CONST });
  assert.ok(!r1.selected.some((c) => c.book_id === 'A')); // 301: 아직 쿨다운

  const r2 = hd.selectTrendingWithCooldown(RANK, r1.nextState, 302, { limit: 2, ...OPT_CONST });
  assert.ok(!r2.selected.some((c) => c.book_id === 'A')); // 302: 아직 쿨다운

  const r3 = hd.selectTrendingWithCooldown(RANK, r2.nextState, 303, { limit: 2, ...OPT_CONST });
  assert.ok(r3.selected.some((c) => c.book_id === 'A')); // 303: 3일 휴식 후 복귀
});

test('selectTrendingWithCooldown: 구 streak 필드도 days_shown 으로 마이그레이션', () => {
  const prev = { A: { streak: 3 } }; // 구 스키마
  const { nextState } = hd.selectTrendingWithCooldown(RANK, prev, 500, { limit: 3, ...OPT });
  assert.deepStrictEqual(nextState.A, { days_shown: 4 }); // 3 → +1
});

test('selectTrendingWithCooldown: 풀 부족 fallback — 쿨다운/안전장치 완화로 limit 채움', () => {
  // 모든 후보가 쿨다운이라 적격이 0이지만, limit 만큼 강제 충원.
  const prev = { A: { cooldownUntil: 500 }, B: { cooldownUntil: 500 } };
  const { selected } = hd.selectTrendingWithCooldown(RANK.slice(0, 2), prev, 100, {
    limit: 2,
    ...OPT,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['A', 'B']);
});

test('generateHomeDynamic: _trending_state 를 읽어 streak 누적하고 새 상태를 기록(연속 실행 배선)', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const dayIndex = hd.kstDayIndex(now);
  // nextDay 기준 3일 윈도우(cutoff = 06-05T03Z)에도 들어오도록 06-06 사용.
  const recent = '2026-06-06T00:00:00Z';
  const baseArgs = {
    readTimeLogs: [
      { id: 'l1', book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: recent },
      { id: 'l2', book_id: 'A', user_uid: 'u2', read_time: 30, createdAt: recent },
    ],
    books: [{ id: 'A', hidden: false }, { id: 'D1', hidden: false }],
    mainBooks: [],
  };

  // 1회차: 상태 문서 없음 → A streak=1 로 기록.
  const db1 = makeFakeDb(baseArgs);
  await hd.generateHomeDynamic(db1, now);
  const st1 = db1._writes['home_dynamic/_trending_state'];
  assert.strictEqual(st1.day, dayIndex);
  assert.deepStrictEqual(st1.state.A, { days_shown: 1 });

  // 2회차(다음 날): 1회차가 남긴 상태를 입력으로 넣으면 streak 가 누적된다(읽기→쓰기 배선).
  const nextDay = new Date('2026-06-08T03:00:00Z');
  const db2 = makeFakeDb({
    ...baseArgs,
    docs: { 'home_dynamic/_trending_state': st1 },
  });
  await hd.generateHomeDynamic(db2, nextDay);
  const st2 = db2._writes['home_dynamic/_trending_state'];
  assert.deepStrictEqual(st2.state.A, { days_shown: 2 });
});

test('generateHomeDynamic: 같은 날 재실행은 streak 를 이중 증가시키지 않는다(멱등)', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const baseArgs = {
    readTimeLogs: [
      { id: 'l1', book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: '2026-06-05T00:00:00Z' },
      { id: 'l2', book_id: 'A', user_uid: 'u2', read_time: 30, createdAt: '2026-06-05T00:00:00Z' },
    ],
    books: [{ id: 'A', hidden: false }, { id: 'D1', hidden: false }],
    mainBooks: [],
  };

  const db1 = makeFakeDb(baseArgs);
  await hd.generateHomeDynamic(db1, now);
  const st1 = db1._writes['home_dynamic/_trending_state'];
  assert.deepStrictEqual(st1.state.A, { days_shown: 1 });

  // 같은 날(now 동일) 재실행 → baseline 재사용으로 days_shown 가 1 그대로.
  const db2 = makeFakeDb({
    ...baseArgs,
    docs: { 'home_dynamic/_trending_state': st1 },
  });
  await hd.generateHomeDynamic(db2, now);
  const st2 = db2._writes['home_dynamic/_trending_state'];
  assert.deepStrictEqual(st2.state.A, { days_shown: 1 });
});

// ---- P2-2: aggregateReadersFromDailyDocs ----

function makeDailyDb(readerCountDocs, totalTimeDocs) {
  return {
    collection(name) {
      const docs = name === 'dayly_reader_count' ? readerCountDocs : totalTimeDocs;
      return {
        doc(dateStr) {
          const d = docs[dateStr];
          return {
            get: async () =>
              d ? { exists: true, data: () => d } : { exists: false, data: () => undefined },
          };
        },
      };
    },
  };
}

test('aggregateReadersFromDailyDocs: 단일 날짜 기본 집계', async () => {
  // now = 2026-06-10, windowDays=1 → 오늘치 1개 문서만 읽음
  const now = new Date('2026-06-10T01:00:00Z'); // KST 06-10 10시
  const todayKST = '2026-06-10';
  const readerDocs = { [todayKST]: { reader_count: { A: 3, B: 1 } } };
  const timeDocs = { [todayKST]: { total_count: { A: 300, B: 60 } } };
  const db = makeDailyDb(readerDocs, timeDocs);

  const result = await hd.aggregateReadersFromDailyDocs(db, now, 1);
  const a = result.find((x) => x.book_id === 'A');
  const b = result.find((x) => x.book_id === 'B');

  // 오늘(days_ago=0) 가중치 = 1.0
  assert.strictEqual(a.reader_count, 3);
  assert.ok(Math.abs(a.weighted_readers - 3.0) < 1e-9);
  assert.strictEqual(a.total_read_time, 300);
  assert.strictEqual(b.reader_count, 1);
});

test('aggregateReadersFromDailyDocs: 2일치 감쇠 합산', async () => {
  // now = KST 06-10. 어제(KST 06-09) reader=2, 오늘 reader=1.
  // 반감기 3일: 어제 weight=0.5^(1/3)≈0.794, 오늘 weight=1.0
  // weighted = 1*1.0 + 2*0.794 ≈ 2.587
  const now = new Date('2026-06-10T01:00:00Z');
  const readerDocs = {
    '2026-06-10': { reader_count: { A: 1 } },
    '2026-06-09': { reader_count: { A: 2 } },
  };
  const timeDocs = {
    '2026-06-10': { total_count: { A: 100 } },
    '2026-06-09': { total_count: { A: 200 } },
  };
  const db = makeDailyDb(readerDocs, timeDocs);
  const result = await hd.aggregateReadersFromDailyDocs(db, now, 2, { halfLife: 3 });
  const a = result.find((x) => x.book_id === 'A');

  const expectedWeighted = 1 * 1.0 + 2 * Math.pow(0.5, 1 / 3);
  assert.ok(Math.abs(a.weighted_readers - expectedWeighted) < 1e-6);
  assert.strictEqual(a.reader_count, 3);   // 크로스데이 합산(중복 포함)
  assert.strictEqual(a.total_read_time, 300);
});

test('aggregateReadersFromDailyDocs: 존재하지 않는 날짜 문서는 스킵', async () => {
  const now = new Date('2026-06-10T01:00:00Z');
  // 어제 문서만 있고 오늘 없음
  const readerDocs = { '2026-06-09': { reader_count: { A: 5 } } };
  const timeDocs = {};
  const db = makeDailyDb(readerDocs, timeDocs);
  const result = await hd.aggregateReadersFromDailyDocs(db, now, 2, { halfLife: 3 });
  const a = result.find((x) => x.book_id === 'A');
  assert.ok(a !== undefined);
  assert.strictEqual(a.reader_count, 5);
});

test('aggregateReadersFromDailyDocs vs aggregateReaders: 단일 사용자·단일 날짜는 동등', async () => {
  // 하루치 로그 1건(크로스데이 없음) → 두 방식의 결과가 일치해야 한다.
  const now = new Date('2026-06-10T01:00:00Z');
  const todayKST = '2026-06-10';

  const logs = [
    { book_id: 'A', user_uid: 'u1', read_time: 50, createdAt: '2026-06-10T00:30:00Z' },
    { book_id: 'A', user_uid: 'u2', read_time: 30, createdAt: '2026-06-10T00:30:00Z' },
  ];
  const rawResult = hd.aggregateReaders(logs, now, { halfLife: 3 });
  const rawA = rawResult.find((x) => x.book_id === 'A');

  const readerDocs = { [todayKST]: { reader_count: { A: 2 } } };
  const timeDocs = { [todayKST]: { total_count: { A: 80 } } };
  const db = makeDailyDb(readerDocs, timeDocs);
  const dailyResult = await hd.aggregateReadersFromDailyDocs(db, now, 1, { halfLife: 3 });
  const dailyA = dailyResult.find((x) => x.book_id === 'A');

  // reader_count 동일 (단일 날짜는 중복 없음)
  assert.strictEqual(dailyA.reader_count, rawA.reader_count);
  // total_read_time 동일
  assert.strictEqual(dailyA.total_read_time, rawA.total_read_time);
  // weighted_readers: 오늘 로그(days_ago≈0)는 둘 다 weight≈1 → 근사 일치
  // (raw는 정확한 ms 기준, daily는 days_ago=0으로 처리하므로 작은 차이 허용)
  assert.ok(Math.abs(dailyA.weighted_readers - rawA.weighted_readers) < 0.1);
});

test('aggregateReadersFromDailyDocs 한계: 크로스데이 중복이 raw 보다 reader_count를 과다계산', async () => {
  // u1 이 같은 책 A를 이틀 연속 읽는 상황.
  // raw-log 방식: u1 은 '가장 최근 로그' 가중치만 1회 → reader_count=1
  // daily 방식: 날짜별 독자수 합산 → reader_count=2 (알려진 한계)
  const now = new Date('2026-06-10T01:00:00Z');
  const logs = [
    { book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: '2026-06-09T01:00:00Z' },
    { book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: '2026-06-10T00:30:00Z' },
  ];
  const rawA = hd.aggregateReaders(logs, now, { halfLife: 3 }).find((x) => x.book_id === 'A');

  const readerDocs = {
    '2026-06-10': { reader_count: { A: 1 } },
    '2026-06-09': { reader_count: { A: 1 } },
  };
  const timeDocs = {
    '2026-06-10': { total_count: { A: 30 } },
    '2026-06-09': { total_count: { A: 30 } },
  };
  const db = makeDailyDb(readerDocs, timeDocs);
  const dailyA = (await hd.aggregateReadersFromDailyDocs(db, now, 2, { halfLife: 3 }))
    .find((x) => x.book_id === 'A');

  assert.strictEqual(rawA.reader_count, 1);   // raw: 고유 독자 1명
  assert.strictEqual(dailyA.reader_count, 2); // daily: 날짜별 합산 → 2 (알려진 과다계산)
});
