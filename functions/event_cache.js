// 활성 이벤트(time_event / limit_event)의 book_id 집합을 캐시해
// add_time_read_time_logs 트리거에서 대부분의 로그에 대한 Firestore 이벤트 조회를 스킵하도록 한다.
//
// 캐시 구조:
//   Firestore: event_state/active_books = { time: [book_id...], limit: [book_id...], updated_at }
//   In-memory: Set 쌍(time, limit) + TTL 5분 (Cloud Functions 인스턴스 재활용 구간 대응)
//
// 한계:
//   - 외부(Admin Console 등)에서 신규 이벤트를 생성하면 다음 daily_job(자정) 혹은
//     refresh_active_books HTTPS 호출 전까지 캐시에 반영되지 않는다.
//     → 그 사이 발생한 독서 로그가 해당 이벤트에 집계되지 않을 수 있음.
//   - limit_event 의 is_active=false 전환은 daily_job 재빌드로 반영된다.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const ACTIVE_BOOKS_DOC = 'event_state/active_books';

let _cache = null; // { time: Set<string>, limit: Set<string> }
let _expiry = 0;   // epoch ms

/**
 * 활성 이벤트 book_id 집합을 반환한다.
 * 인스턴스 메모리에 TTL 내 캐시가 있으면 Firestore를 읽지 않는다.
 * @param {FirebaseFirestore.Firestore} db
 * @returns {Promise<{time: Set<string>, limit: Set<string>}>}
 */
async function getActiveBooks(db) {
  const now = Date.now();
  if (_cache && now < _expiry) return _cache;

  const [col, docId] = ACTIVE_BOOKS_DOC.split('/');
  const snap = await db.collection(col).doc(docId).get();
  const data = snap.exists ? snap.data() : { time: [], limit: [] };

  _cache = {
    time: new Set(Array.isArray(data.time) ? data.time : []),
    limit: new Set(Array.isArray(data.limit) ? data.limit : []),
  };
  _expiry = now + CACHE_TTL_MS;
  return _cache;
}

/**
 * 인스턴스 메모리 캐시를 즉시 만료시킨다(다음 getActiveBooks 호출이 Firestore를 읽도록).
 */
function invalidateActiveBooksCache() {
  _cache = null;
  _expiry = 0;
}

/**
 * time_event / limit_event 에서 is_active==true 인 book_id 를 재조회해
 * event_state/active_books 를 갱신하고 인스턴스 캐시도 무효화한다.
 * daily_job 시작 시, 또는 refresh_active_books HTTPS 엔드포인트에서 호출한다.
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin')} admin  — serverTimestamp()를 위해
 */
async function rebuildActiveBooksCache(db, admin) {
  const [timeSnap, limitSnap] = await Promise.all([
    db.collection('time_event').where('is_active', '==', true).get(),
    db.collection('limit_event').where('is_active', '==', true).get(),
  ]);

  const timeIds = [...new Set(
    timeSnap.docs.map((d) => d.data().book_id).filter(Boolean)
  )];
  const limitIds = [...new Set(
    limitSnap.docs.map((d) => d.data().book_id).filter(Boolean)
  )];

  const [col, docId] = ACTIVE_BOOKS_DOC.split('/');
  await db.collection(col).doc(docId).set({
    time: timeIds,
    limit: limitIds,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  invalidateActiveBooksCache();
  console.log(`rebuildActiveBooksCache: time=${timeIds.length}, limit=${limitIds.length}`);
}

module.exports = { getActiveBooks, invalidateActiveBooksCache, rebuildActiveBooksCache };
