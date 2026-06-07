// 동적 홈 편성 (Phase 1): read_time_logs 집계 → 트렌딩/발견 선정 →
// home_dynamic/current + suggest_group 자동행 2개 기록.
// 순수 선정 로직은 테스트 가능하게 분리하고, generateHomeDynamic 만 Firestore I/O.
// 스펙: bookchelin_android/docs/superpowers/specs/2026-06-07-dynamic-home-rails-design.md
const moment = require('moment-timezone');

const KST = 'Asia/Seoul';

function kstDateString(date) {
  return moment(date).tz(KST).format('YYYY-MM-DD');
}

function kstDayIndex(date) {
  const s = kstDateString(date);
  return Math.floor(moment.tz(s + ' 00:00', KST).valueOf() / 86400000);
}

function aggregateReaders(logs) {
  const map = new Map();
  for (const d of logs) {
    if (!d || !d.book_id) continue;
    let e = map.get(d.book_id);
    if (!e) {
      e = { book_id: d.book_id, readers: new Set(), total_read_time: 0 };
      map.set(d.book_id, e);
    }
    if (d.user_uid) e.readers.add(d.user_uid);
    e.total_read_time += typeof d.read_time === 'number' ? d.read_time : 0;
  }
  return [...map.values()].map((e) => ({
    book_id: e.book_id,
    reader_count: e.readers.size,
    total_read_time: e.total_read_time,
  }));
}

function selectTrending(aggregates, opts) {
  const { visibleIds, excludeIds = [], minReaders = 2, limit = 8 } = opts;
  const visible = new Set(visibleIds);
  const exclude = new Set(excludeIds);
  return aggregates
    .filter(
      (a) =>
        visible.has(a.book_id) &&
        !exclude.has(a.book_id) &&
        a.reader_count >= minReaders
    )
    .sort(
      (a, b) =>
        b.reader_count - a.reader_count ||
        b.total_read_time - a.total_read_time
    )
    .slice(0, limit)
    .map((a) => ({ book_id: a.book_id, reader_count: a.reader_count }));
}

function selectDiscover(opts) {
  const { pool, dayIndex, window = 10 } = opts;
  const n = pool.length;
  if (n === 0) return [];
  const start = (((dayIndex * window) % n) + n) % n;
  const out = [];
  for (let i = 0; i < Math.min(window, n); i++) {
    out.push(pool[(start + i) % n]);
  }
  return out;
}

function buildAutoSuggestDocs(trending, discover) {
  return {
    _auto_trending: {
      auto: true,
      order: '0',
      title: '🔥 지금 인기',
      books: trending.map((t) => t.book_id),
    },
    _auto_discover: {
      auto: true,
      order: '00',
      title: '✨ 오늘의 발견',
      books: discover.slice(),
    },
  };
}

async function generateHomeDynamic(db, now = new Date()) {
  const cutoffISO = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  const rtSnap = await db
    .collection('read_time_logs')
    .where('createdAt', '>=', cutoffISO)
    .get();
  const logs = rtSnap.docs.map((d) => d.data());

  const booksSnap = await db.collection('books').where('hidden', '==', false).get();
  const visibleIds = booksSnap.docs.map((d) => d.id);

  const mbSnap = await db.collection('main_books').get();
  const pinIds = mbSnap.docs.map((d) => d.data().book_id).filter(Boolean);

  const aggregates = aggregateReaders(logs);
  const trending = selectTrending(aggregates, {
    visibleIds,
    excludeIds: pinIds,
    minReaders: 2,
    limit: 8,
  });

  const pinSet = new Set(pinIds);
  const trendingSet = new Set(trending.map((t) => t.book_id));
  const readSet = new Set(aggregates.map((a) => a.book_id));
  const basePool = visibleIds
    .filter((id) => !pinSet.has(id) && !trendingSet.has(id))
    .sort();
  const dormant = basePool.filter((id) => !readSet.has(id));
  const active = basePool.filter((id) => readSet.has(id));
  const orderedPool = dormant.concat(active);

  const dayIndex = kstDayIndex(now);
  const discover = selectDiscover({ pool: orderedPool, dayIndex, window: 10 });
  // 상단 캐러셀: 큐레이션 핀(main_books)을 날짜 윈도우로 매일 회전(내리고/올리기).
  const carousel = selectDiscover({ pool: pinIds, dayIndex, window: 10 });

  const autoDocs = buildAutoSuggestDocs(trending, discover);

  const batch = db.batch();
  batch.set(db.collection('home_dynamic').doc('current'), {
    updated_at: now,
    date: kstDateString(now),
    carousel,
    trending,
    discover,
  });
  batch.set(db.collection('suggest_group').doc('_auto_trending'), autoDocs._auto_trending);
  batch.set(db.collection('suggest_group').doc('_auto_discover'), autoDocs._auto_discover);
  await batch.commit();

  return { date: kstDateString(now), carousel: carousel.length, trending: trending.length, discover: discover.length };
}

module.exports = {
  kstDateString,
  kstDayIndex,
  aggregateReaders,
  selectTrending,
  selectDiscover,
  buildAutoSuggestDocs,
  generateHomeDynamic,
};
