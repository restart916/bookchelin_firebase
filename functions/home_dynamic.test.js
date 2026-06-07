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

function makeFakeDb({ readTimeLogs = [], books = [], mainBooks = [] }) {
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
          return { _ref: name + '/' + id };
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
