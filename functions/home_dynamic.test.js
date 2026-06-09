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
  assert.deepStrictEqual(out, [
    { book_id: 'B', reader_count: 13 },
    { book_id: 'A', reader_count: 13 },
  ]);
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

test('buildAutoSuggestDocs: order "0"/"00", auto:true, 제목/books 매핑', () => {
  const trending = [{ book_id: 'A', reader_count: 5 }, { book_id: 'B', reader_count: 3 }];
  const discover = ['x', 'y', 'z'];
  const docs = hd.buildAutoSuggestDocs(trending, discover);
  assert.deepStrictEqual(docs._auto_trending, {
    auto: true, order: '0', title: '🔥 지금 인기', books: ['A', 'B'],
  });
  assert.deepStrictEqual(docs._auto_discover, {
    auto: true, order: '00', title: '✨ 오늘의 발견', books: ['x', 'y', 'z'],
  });
});

function makeFakeDb({ readTimeLogs = [], books = [], mainBooks = [], docs = {} }) {
  const writes = {};
  const cols = { read_time_logs: readTimeLogs, books, main_books: mainBooks };
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
  const recent = '2026-06-05T00:00:00Z'; // 7일 이내
  const db = makeFakeDb({
    readTimeLogs: [
      { id: 'l1', book_id: 'A', user_uid: 'u1', read_time: 30, createdAt: recent },
      { id: 'l2', book_id: 'A', user_uid: 'u2', read_time: 30, createdAt: recent },
      { id: 'l3', book_id: 'P', user_uid: 'u3', read_time: 99, createdAt: recent }, // 핀
      { id: 'l4', book_id: 'A', user_uid: 'u4', read_time: 1, createdAt: '2020-01-01T00:00:00Z' }, // 오래됨→제외
    ],
    books: [
      { id: 'A', hidden: false },
      { id: 'P', hidden: false },
      { id: 'D1', hidden: false }, // 발견 풀(잠자는)
      { id: 'D2', hidden: false },
      { id: 'HID', hidden: true }, // 비가시 → 풀에서 제외
    ],
    mainBooks: [{ id: 'mb1', book_id: 'P' }], // 핀
  });

  const result = await hd.generateHomeDynamic(db, now);

  const home = db._writes['home_dynamic/current'];
  assert.strictEqual(home.date, '2026-06-07');
  // 캐러셀 = 핀(main_books) 회전 윈도우 → 핀이 P 하나뿐이므로 ['P']
  assert.deepStrictEqual(home.carousel, ['P']);
  // A는 7일내 유저 2명 → 트렌딩. P는 핀이라 제외.
  assert.deepStrictEqual(home.trending, [{ book_id: 'A', reader_count: 2 }]);
  // 발견 풀 = 가시 - 핀(P) - 트렌딩(A) = [D1, D2] (HID 제외)
  assert.deepStrictEqual(home.discover.slice().sort(), ['D1', 'D2']);

  const t = db._writes['suggest_group/_auto_trending'];
  const d = db._writes['suggest_group/_auto_discover'];
  assert.strictEqual(t.order, '0');
  assert.deepStrictEqual(t.books, ['A']);
  assert.strictEqual(d.order, '00');
  assert.strictEqual(result.trending, 1);
});

// ---- 트렌딩 고착 방지(쿨다운) 룰 ----

const RANK = [
  { book_id: 'A', reader_count: 10 },
  { book_id: 'B', reader_count: 9 },
  { book_id: 'C', reader_count: 8 },
];

test('selectTrendingWithCooldown: 상태 없으면 랭크 상위 limit개, streak=1로 시작', () => {
  const { selected, nextState } = hd.selectTrendingWithCooldown(RANK, {}, 100, {
    limit: 2,
    maxStreak: 2,
    cooldownDays: 2,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['A', 'B']);
  assert.deepStrictEqual(nextState.A, { streak: 1 });
  assert.deepStrictEqual(nextState.B, { streak: 1 });
  assert.strictEqual(nextState.C, undefined); // 노출 안 됨 → 상태 없음
});

test('selectTrendingWithCooldown: 연속 노출 시 streak 증가(어제 streak>0)', () => {
  const prev = { A: { streak: 1 }, B: { streak: 1 } };
  const { nextState } = hd.selectTrendingWithCooldown(RANK, prev, 101, { limit: 2 });
  assert.deepStrictEqual(nextState.A, { streak: 2 });
  assert.deepStrictEqual(nextState.B, { streak: 2 });
});

test('selectTrendingWithCooldown: maxStreak 도달(2일 연속) → 3일째 제외 + 2일 쿨다운, 다음 순위로 충원', () => {
  // A,B 가 어제까지 2일 연속 노출(streak=2) → 오늘 막히고 C 가 올라온다.
  const prev = { A: { streak: 2 }, B: { streak: 2 } };
  const { selected, nextState } = hd.selectTrendingWithCooldown(RANK, prev, 102, {
    limit: 1,
    maxStreak: 2,
    cooldownDays: 2,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['C']); // A,B 빠지고 C만 적격
  // A,B 는 쿨다운 진입: cooldownUntil = 102 + 2 - 1 = 103 (102,103 두 날 제외)
  assert.deepStrictEqual(nextState.A, { streak: 0, cooldownUntil: 103 });
  assert.deepStrictEqual(nextState.B, { streak: 0, cooldownUntil: 103 });
  assert.deepStrictEqual(nextState.C, { streak: 1 });
});

test('selectTrendingWithCooldown: 쿨다운 중이면 제외, 이월되며 만료 후 재등장', () => {
  const prev = { A: { streak: 0, cooldownUntil: 103 } };
  // day 103: 아직 쿨다운(<=103) → A 제외(B,C 가 자리를 채워 fallback 불필요), 이월 안 됨(103이 마지막날)
  const r1 = hd.selectTrendingWithCooldown(RANK, prev, 103, { limit: 2 });
  assert.ok(!r1.selected.some((c) => c.book_id === 'A'));
  assert.strictEqual(r1.nextState.A, undefined); // 103이 마지막 제외일 → 이월 불필요
  // day 104: 쿨다운 만료 → A 다시 적격
  const r2 = hd.selectTrendingWithCooldown(RANK, prev, 104, { limit: 2 });
  assert.ok(r2.selected.some((c) => c.book_id === 'A'));
});

test('selectTrendingWithCooldown: 미래까지 가는 쿨다운(cooldownDays=3)은 다음날로 이월', () => {
  // A,B 는 상한 도달, C·D 가 적격 충원재라 강제 fallback 없이 A,B 가 쿨다운에 들어간다.
  const rank = [
    { book_id: 'A', reader_count: 5 },
    { book_id: 'B', reader_count: 4 },
    { book_id: 'C', reader_count: 3 },
    { book_id: 'D', reader_count: 2 },
  ];
  const prev = { A: { streak: 2 }, B: { streak: 2 } };
  const { selected, nextState } = hd.selectTrendingWithCooldown(rank, prev, 200, {
    limit: 2,
    maxStreak: 2,
    cooldownDays: 3,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['C', 'D']);
  // cooldownUntil = 200 + 3 - 1 = 202 → 200,201,202 세 날 제외
  assert.deepStrictEqual(nextState.A, { streak: 0, cooldownUntil: 202 });
  // 다음 실행(day 201)에서 이월 확인 (201 < 202 이므로 유지)
  const r = hd.selectTrendingWithCooldown(rank, nextState, 201, {
    limit: 2,
    maxStreak: 2,
    cooldownDays: 3,
  });
  assert.deepStrictEqual(r.nextState.A, { streak: 0, cooldownUntil: 202 });
});

test('selectTrendingWithCooldown: 풀 부족 fallback — 쿨다운/상한 완화로 limit 채움', () => {
  // 모든 후보가 쿨다운이라 적격이 0이지만, limit 만큼 강제 충원.
  const prev = { A: { cooldownUntil: 500 }, B: { cooldownUntil: 500 } };
  const { selected } = hd.selectTrendingWithCooldown(RANK.slice(0, 2), prev, 100, {
    limit: 2,
  });
  assert.deepStrictEqual(selected.map((c) => c.book_id), ['A', 'B']);
});

test('generateHomeDynamic: _trending_state 를 읽어 streak 누적하고 새 상태를 기록(연속 실행 배선)', async () => {
  const now = new Date('2026-06-07T03:00:00Z');
  const dayIndex = hd.kstDayIndex(now);
  const recent = '2026-06-05T00:00:00Z';
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
  assert.deepStrictEqual(st1.state.A, { streak: 1 });

  // 2회차: 1회차가 남긴 상태를 입력으로 넣으면 streak 가 누적된다(읽기→쓰기 배선 확인).
  const db2 = makeFakeDb({
    ...baseArgs,
    docs: { 'home_dynamic/_trending_state': st1 },
  });
  await hd.generateHomeDynamic(db2, now);
  const st2 = db2._writes['home_dynamic/_trending_state'];
  assert.deepStrictEqual(st2.state.A, { streak: 2 });
});
