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
  // Discord 알림 등에서 책 제목을 보여주기 위한 id→title 맵(보이는 책 한정, 없으면 id 폴백).
  const titleById = new Map(
    booksSnap.docs.map((d) => [d.id, (d.data() || {}).title])
  );
  const titleOf = (id) => titleById.get(id) || id;

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
  const stateDoc = (stateSnap && stateSnap.exists ? stateSnap.data() : null) || {};
  // 같은 날 재실행(예: regenerate 수동 호출)이 streak 를 이중 증가시키지 않도록,
  // 그날의 입력 baseline 을 재사용해 멱등하게 만든다. 날이 바뀌면 직전 결과(state)를 입력으로.
  const prevState =
    (stateDoc.day === dayIndex ? stateDoc.baseline : stateDoc.state) || {};
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
  // baseline = 이번 실행에 쓴 입력 상태. 같은 날 재실행 시 멱등성을 위해 함께 저장.
  batch.set(stateRef, { updated_at: now, day: dayIndex, state: nextState, baseline: prevState });
  await batch.commit();

  // 반환값: 알림/검증에서 쓰도록 제목과 '오늘 새로 진입(streak===1)' 표시를 덧붙인 상세 리스트.
  // Firestore 에 쓰는 문서 shape(위 batch)은 그대로 두고, 반환만 풍부하게 한다.
  return {
    date: kstDateString(now),
    carousel: carousel.map((id) => ({ book_id: id, title: titleOf(id) })),
    trending: trending.map((t) => ({
      book_id: t.book_id,
      reader_count: t.reader_count,
      title: titleOf(t.book_id),
      is_new: Boolean(nextState[t.book_id] && nextState[t.book_id].streak === 1),
    })),
    discover: discover.map((id) => ({ book_id: id, title: titleOf(id) })),
  };
}

// 일간 큐레이션 결과를 Discord 로 보낼 사람이 읽기 좋은 텍스트로 만든다(순수 함수).
// generateHomeDynamic 의 반환값을 그대로 받는다. 오늘 새로 인기에 든 책은 🆕 로 표시.
function formatCurationMessage(result) {
  const fmt = (b) => `• ${b.title || b.book_id}${b.is_new ? '  🆕' : ''}`;
  const lines = [`📚 일간 큐레이션 갱신 — ${result.date}`];
  const section = (emoji, label, items) => {
    lines.push('', `${emoji} ${label} (${items.length})`);
    if (items.length === 0) lines.push('• (없음)');
    else for (const b of items) lines.push(fmt(b));
  };
  section('🔥', '지금 인기', result.trending || []);
  section('✨', '오늘의 발견', result.discover || []);
  section('🎠', '캐러셀', result.carousel || []);
  let msg = lines.join('\n');
  if (msg.length > 1900) msg = msg.slice(0, 1900) + '\n… (생략)';
  return msg;
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
  formatCurationMessage,
};
