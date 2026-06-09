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

// 가시·핀제외·최소독자 필터 후 독자수 desc(동점 시 read_time desc) 정렬한 '전체' 후보 랭킹.
// 쿨다운 룰이 상위에서 책을 빼더라도 다음 순위로 채울 수 있게 slice 하지 않은 풀을 돌려준다.
function rankTrending(aggregates, opts) {
  const { visibleIds, excludeIds = [], minReaders = 2 } = opts;
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
    .map((a) => ({ book_id: a.book_id, reader_count: a.reader_count }));
}

function selectTrending(aggregates, opts) {
  const { limit = 8 } = opts;
  return rankTrending(aggregates, opts).slice(0, limit);
}

// 고착 방지 룰: 한 책은 최대 maxStreak 일 연속까지만 "지금 인기"에 노출되고,
// 그 뒤 cooldownDays 일간 제외된다. prevState 는 어제 실행이 남긴 상태 맵
// ({ [book_id]: { streak, cooldownUntil } }). cooldownUntil 은 그 dayIndex 까지(포함) 제외.
// 순수 함수 — Firestore I/O 없이 { selected, nextState } 를 돌려줘 테스트 가능하게 둔다.
function selectTrendingWithCooldown(ranked, prevState, dayIndex, opts) {
  const { limit = 8, maxStreak = 2, cooldownDays = 2 } = opts || {};
  const state = prevState || {};
  const prev = (id) => {
    const p = state[id];
    return {
      streak: p && typeof p.streak === 'number' ? p.streak : 0,
      cooldownUntil:
        p && typeof p.cooldownUntil === 'number' ? p.cooldownUntil : -1,
    };
  };

  const eligible = [];
  const blocked = []; // 랭크엔 들었으나 연속 노출 상한(atCap)으로 막힌 책 → 쿨다운 진입
  for (const c of ranked) {
    const p = prev(c.book_id);
    const inCooldown = dayIndex <= p.cooldownUntil;
    const atCap = p.streak >= maxStreak;
    if (inCooldown) continue;
    if (atCap) blocked.push(c);
    else eligible.push(c);
  }

  const selected = eligible.slice(0, limit);
  // 풀 부족 fallback: 후보가 limit 미만이면 쿨다운/상한을 일시 완화해 랭크 순으로 채운다.
  if (selected.length < limit) {
    const chosen = new Set(selected.map((c) => c.book_id));
    for (const c of ranked) {
      if (selected.length >= limit) break;
      if (chosen.has(c.book_id)) continue;
      selected.push(c);
      chosen.add(c.book_id);
    }
  }

  const selectedSet = new Set(selected.map((c) => c.book_id));
  const nextState = {};
  for (const c of selected) {
    const p = prev(c.book_id);
    // 어제 노출됐으면(streak>0) 연속, 아니면 1로 리셋.
    nextState[c.book_id] = { streak: p.streak > 0 ? p.streak + 1 : 1 };
  }
  // 상한에 걸려 빠진 책(강제 충원되지 않은) → 쿨다운 진입.
  for (const c of blocked) {
    if (selectedSet.has(c.book_id)) continue;
    nextState[c.book_id] = {
      streak: 0,
      cooldownUntil: dayIndex + cooldownDays - 1,
    };
  }
  // 아직 끝나지 않은(내일 이후까지 가는) 쿨다운은 그대로 이월.
  for (const id of Object.keys(state)) {
    if (nextState[id]) continue;
    const p = prev(id);
    if (p.cooldownUntil > dayIndex) {
      nextState[id] = { streak: 0, cooldownUntil: p.cooldownUntil };
    }
  }

  return { selected, nextState };
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
  const ranked = rankTrending(aggregates, {
    visibleIds,
    excludeIds: pinIds,
    minReaders: 2,
  });

  // 트렌딩 고착 방지: 이전 노출 상태(streak/cooldown)를 읽어 룰을 적용한다.
  const dayIndex = kstDayIndex(now);
  const stateRef = db.collection('home_dynamic').doc('_trending_state');
  const stateSnap = await stateRef.get();
  const prevState =
    (stateSnap && stateSnap.exists ? (stateSnap.data() || {}).state : null) ||
    {};
  const { selected: trending, nextState } = selectTrendingWithCooldown(
    ranked,
    prevState,
    dayIndex,
    { limit: 8, maxStreak: 2, cooldownDays: 2 }
  );

  const pinSet = new Set(pinIds);
  const trendingSet = new Set(trending.map((t) => t.book_id));
  const readSet = new Set(aggregates.map((a) => a.book_id));
  const basePool = visibleIds
    .filter((id) => !pinSet.has(id) && !trendingSet.has(id))
    .sort();
  const dormant = basePool.filter((id) => !readSet.has(id));
  const active = basePool.filter((id) => readSet.has(id));
  const orderedPool = dormant.concat(active);

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
  batch.set(stateRef, { updated_at: now, day: dayIndex, state: nextState });
  await batch.commit();

  return { date: kstDateString(now), carousel: carousel.length, trending: trending.length, discover: discover.length };
}

module.exports = {
  kstDateString,
  kstDayIndex,
  aggregateReaders,
  rankTrending,
  selectTrending,
  selectTrendingWithCooldown,
  selectDiscover,
  buildAutoSuggestDocs,
  generateHomeDynamic,
};
