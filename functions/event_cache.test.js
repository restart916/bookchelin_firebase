const test = require('node:test');
const assert = require('node:assert');

// event_cache.js는 모듈 수준 변수(_cache, _expiry)를 사용한다.
// 각 테스트는 독립 실행이 보장되지 않으므로, 매 테스트마다 invalidate 를 호출해 초기화한다.
const ec = require('./event_cache');

function makeDb(timeActive = [], limitActive = [], docData = null) {
  const reads = { count: 0 };
  return {
    _reads: reads,
    collection(name) {
      return {
        where(field, op, val) {
          const source = name === 'time_event' ? timeActive : limitActive;
          const filtered = source.filter((d) => {
            if (op === '==') return d[field] === val;
            return true;
          });
          return {
            get: async () => ({ docs: filtered.map((d) => ({ data: () => d })) }),
          };
        },
        doc(id) {
          return {
            get: async () => {
              reads.count++;
              if (docData) return { exists: true, data: () => docData };
              return { exists: false, data: () => undefined };
            },
            set: async () => {},
          };
        },
      };
    },
  };
}

function makeAdmin() {
  return {
    firestore: {
      FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
    },
  };
}

test('getActiveBooks: Firestore doc 없으면 빈 Set 반환', async () => {
  ec.invalidateActiveBooksCache();
  const db = makeDb();
  const result = await ec.getActiveBooks(db);
  assert.ok(result.time instanceof Set);
  assert.ok(result.limit instanceof Set);
  assert.strictEqual(result.time.size, 0);
  assert.strictEqual(result.limit.size, 0);
});

test('getActiveBooks: Firestore doc 있으면 book_id Set 반환', async () => {
  ec.invalidateActiveBooksCache();
  const db = makeDb([], [], { time: ['bookA', 'bookB'], limit: ['bookC'] });
  const result = await ec.getActiveBooks(db);
  assert.ok(result.time.has('bookA'));
  assert.ok(result.time.has('bookB'));
  assert.ok(result.limit.has('bookC'));
  assert.strictEqual(result.time.size, 2);
  assert.strictEqual(result.limit.size, 1);
});

test('getActiveBooks: 캐시 히트 시 Firestore를 다시 읽지 않는다', async () => {
  ec.invalidateActiveBooksCache();
  const db = makeDb([], [], { time: ['bookX'], limit: [] });
  await ec.getActiveBooks(db);
  const readsBefore = db._reads.count;
  await ec.getActiveBooks(db); // 캐시 히트
  assert.strictEqual(db._reads.count, readsBefore); // 추가 읽기 없음
});

test('invalidateActiveBooksCache: 무효화 후 다음 호출이 Firestore를 다시 읽는다', async () => {
  ec.invalidateActiveBooksCache();
  const db = makeDb([], [], { time: [], limit: [] });
  await ec.getActiveBooks(db);
  const readsBefore = db._reads.count;
  ec.invalidateActiveBooksCache();
  await ec.getActiveBooks(db); // 캐시 미스 → Firestore 읽기
  assert.strictEqual(db._reads.count, readsBefore + 1);
});

test('rebuildActiveBooksCache: is_active==true 이벤트만 수집해 문서 갱신', async () => {
  ec.invalidateActiveBooksCache();
  const timeEvents = [
    { book_id: 'A', is_active: true },
    { book_id: 'B', is_active: false }, // 제외
    { book_id: 'A', is_active: true }, // 중복 book_id → Set으로 dedup
  ];
  const limitEvents = [
    { book_id: 'C', is_active: true },
  ];

  let written = null;
  const db = {
    collection(name) {
      return {
        where(field, op, val) {
          const source = name === 'time_event' ? timeEvents : limitEvents;
          return {
            get: async () => ({
              docs: source.filter((d) => d[field] === val).map((d) => ({ data: () => d })),
            }),
          };
        },
        doc() {
          return {
            set: async (data) => { written = data; },
            get: async () => ({ exists: false }),
          };
        },
      };
    },
  };

  await ec.rebuildActiveBooksCache(db, makeAdmin());

  assert.ok(written !== null);
  assert.deepStrictEqual(written.time.sort(), ['A']); // B 제외, A 중복 dedup
  assert.deepStrictEqual(written.limit, ['C']);

  // 재빌드 후 인스턴스 캐시가 무효화됐는지: db2 로 재조회하면 Firestore를 읽어야 한다
  let reads2 = 0;
  const db2 = {
    collection() {
      return {
        doc() {
          return {
            get: async () => { reads2++; return { exists: false }; },
          };
        },
      };
    },
  };
  await ec.getActiveBooks(db2);
  assert.strictEqual(reads2, 1);
});

test('getActiveBooks: time/limit 필드가 없는 doc도 빈 Set으로 안전 처리', async () => {
  ec.invalidateActiveBooksCache();
  const db = makeDb([], [], {}); // 빈 객체 doc
  const result = await ec.getActiveBooks(db);
  assert.strictEqual(result.time.size, 0);
  assert.strictEqual(result.limit.size, 0);
});
