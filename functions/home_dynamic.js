// 동적 홈 편성 (Phase 1): read_time_logs 집계 → 트렌딩/발견 선정 →
// home_dynamic/current + suggest_group 자동행 2개 기록.
// 순수 선정 로직은 테스트 가능하게 분리하고, generateHomeDynamic 만 Firestore I/O.
// 스펙: bookchelin_android/docs/superpowers/specs/2026-06-07-dynamic-home-rails-design.md
const moment = require('moment-timezone');

const KST = 'Asia/Seoul';

// ── 트렌딩 튜닝 파라미터 (여기만 바꿔서 조정) ───────────────────────────────
// 트렌딩 집계 윈도우(일). 이 기간 내 read_time_logs 만 본다.
const TRENDING_WINDOW_DAYS = 3;
// (1) 시간 감쇠: read_time_log 의 경과일 days_ago 에 weight = 0.5^(days_ago/HALFLIFE_DAYS).
//     작을수록 최신 로그를 더 강하게 반영. 3 이면 3일 전 로그가 가중치 1/2.
const HALFLIFE_DAYS = 3;
// (2) 소프트 노출 패널티: effective = weighted_readers / (1 + EXPOSURE_PENALTY * days_shown).
//     클수록 오래 노출된 책이 더 빨리 순위에서 밀려난다.
const EXPOSURE_PENALTY = 0.35;
// 안전장치: 연속 노출이 이 일수 이상이면 1일 강제 쿨다운(무한 점유 방지). 0 이면 끔.
const SAFETY_MAX_DAYS_SHOWN = 5;
// 안전장치 강제 쿨다운 기간(일). cooldownUntil = flagDay + N - 1 이라 N일 동안 제외된다.
// (예: 3 → 5일 연속 노출된 책이 그 후 3일 빠졌다가 복귀)
const SAFETY_COOLDOWN_DAYS = 3;
const DAY_MS = 86400000;

// read_time_log 경과일(days_ago)에 대한 지수 감쇠 가중치(반감기 halfLife).
function decayWeight(daysAgo, halfLife = HALFLIFE_DAYS) {
  const d = daysAgo > 0 ? daysAgo : 0; // 미래 타임스탬프 방어 → 0
  return Math.pow(0.5, d / halfLife);
}

function kstDateString(date) {
  return moment(date).tz(KST).format('YYYY-MM-DD');
}

function kstDayIndex(date) {
  const s = kstDateString(date);
  return Math.floor(moment.tz(s + ' 00:00', KST).valueOf() / 86400000);
}

// 책별 집계: 고유 독자 수(reader_count)·총 독서시간(total_read_time)에 더해
// 시간 감쇠를 적용한 가중 독자 점수(weighted_readers)를 낸다.
// 고유 독자 개념 유지: 한 user 가 같은 책에 여러 로그를 남겨도, 그 user 의
// '가장 최근(=가중치 최대) 로그' 가중치만 1회 반영해 과다 카운트를 막는다.
// createdAt 이 없는 로그는 days_ago=0(가중치 1)로 취급 → 시간정보 없으면 기존 균등카운트와 동일.
function aggregateReaders(logs, now = new Date(), opts = {}) {
  const halfLife = opts.halfLife || HALFLIFE_DAYS;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const map = new Map();
  for (const d of logs) {
    if (!d || !d.book_id) continue;
    let e = map.get(d.book_id);
    if (!e) {
      e = { book_id: d.book_id, readers: new Set(), bestWeight: new Map(), total_read_time: 0 };
      map.set(d.book_id, e);
    }
    const uid = d.user_uid;
    if (uid) {
      e.readers.add(uid);
      let w = 1; // createdAt 없으면 가중치 1
      if (d.createdAt) {
        const t = new Date(d.createdAt).getTime();
        if (Number.isFinite(t)) w = decayWeight((nowMs - t) / DAY_MS, halfLife);
      }
      const prev = e.bestWeight.get(uid);
      if (prev === undefined || w > prev) e.bestWeight.set(uid, w); // user 당 최대 가중치만
    }
    e.total_read_time += typeof d.read_time === 'number' ? d.read_time : 0;
  }
  return [...map.values()].map((e) => {
    let weighted = 0;
    for (const w of e.bestWeight.values()) weighted += w;
    return {
      book_id: e.book_id,
      reader_count: e.readers.size, // 노이즈 컷(minReaders)용 '실측' 고유 독자 수
      weighted_readers: weighted, // 정렬 1순위로 쓰는 시간가중 점수
      total_read_time: e.total_read_time,
    };
  });
}

// aggregate 의 시간가중 점수(weighted_readers). 없으면 reader_count 로 폴백(하위호환).
function scoreOf(a) {
  return typeof a.weighted_readers === 'number' ? a.weighted_readers : a.reader_count;
}

// 가시·핀제외·최소독자 필터 후 가중독자 desc(동점 시 read_time desc) 정렬한 '전체' 후보 랭킹.
// minReaders 컷은 '실측' reader_count 기준(노이즈 컷)이고, 정렬 점수는 weighted_readers 다.
// 쿨다운/패널티가 상위에서 책을 빼더라도 다음 순위로 채울 수 있게 slice 하지 않은 풀을 돌려준다.
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
        scoreOf(b) - scoreOf(a) ||
        b.total_read_time - a.total_read_time
    )
    .map((a) => ({
      book_id: a.book_id,
      reader_count: a.reader_count,
      weighted_readers: scoreOf(a),
      total_read_time: a.total_read_time,
    }));
}

function selectTrending(aggregates, opts) {
  const { limit = 8 } = opts;
  return rankTrending(aggregates, opts).slice(0, limit);
}

// 고착 방지 룰(소프트 패널티): 하드 연속상한으로 책을 한꺼번에 빼는 대신,
// 누적 노출일수(days_shown)에 비례해 점수를 깎아 순위에서 '서서히' 밀어낸다.
//   effective = score / (1 + exposurePenalty * days_shown)
// 무한 점유만 막도록 아주 가벼운 안전장치(days_shown >= safetyMaxDaysShown → 1일 강제 쿨다운)를 둔다.
// prevState 는 어제 실행이 남긴 상태 맵 ({ [book_id]: { days_shown, cooldownUntil } }).
//   (구 스키마의 streak 필드도 days_shown 으로 읽어 마이그레이션한다.)
// 순수 함수 — Firestore I/O 없이 { selected, nextState } 를 돌려줘 테스트 가능하게 둔다.
function selectTrendingWithCooldown(ranked, prevState, dayIndex, opts) {
  const {
    limit = 8,
    exposurePenalty = EXPOSURE_PENALTY,
    safetyMaxDaysShown = SAFETY_MAX_DAYS_SHOWN, // 0 이면 안전장치 끔
    safetyCooldownDays = SAFETY_COOLDOWN_DAYS,
  } = opts || {};
  const state = prevState || {};
  const prev = (id) => {
    const p = state[id];
    // days_shown(신규) 우선, 없으면 구 streak 로 폴백.
    const ds =
      p && typeof p.days_shown === 'number'
        ? p.days_shown
        : p && typeof p.streak === 'number'
          ? p.streak
          : 0;
    return {
      days_shown: ds,
      cooldownUntil:
        p && typeof p.cooldownUntil === 'number' ? p.cooldownUntil : -1,
    };
  };
  const baseScore = (c) =>
    typeof c.weighted_readers === 'number' ? c.weighted_readers : c.reader_count;

  const eligible = [];
  const blocked = []; // 안전장치(과다 노출)로 1일 강제 쿨다운에 들어갈 책
  for (const c of ranked) {
    const p = prev(c.book_id);
    if (dayIndex <= p.cooldownUntil) continue; // 쿨다운 중 → 제외
    if (safetyMaxDaysShown > 0 && p.days_shown >= safetyMaxDaysShown) {
      blocked.push(c);
      continue;
    }
    const effective = baseScore(c) / (1 + exposurePenalty * p.days_shown);
    eligible.push({ c, effective, base: baseScore(c) });
  }
  // 소프트 패널티 반영 정렬: effective desc, 동점 시 base desc, 그다음 read_time desc.
  eligible.sort(
    (x, y) =>
      y.effective - x.effective ||
      y.base - x.base ||
      (y.c.total_read_time || 0) - (x.c.total_read_time || 0)
  );
  const selected = eligible.slice(0, limit).map((e) => e.c);

  // 풀 부족 fallback: 후보가 limit 미만이면 쿨다운/안전장치를 일시 완화해 랭크 순으로 채운다.
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
    // 연속 노출이면 누적(+1), 끊겼다 다시 들어오면 1로 리셋.
    nextState[c.book_id] = { days_shown: p.days_shown > 0 ? p.days_shown + 1 : 1 };
  }
  // 안전장치로 빠진 책(강제 충원되지 않은) → 짧은 쿨다운 진입.
  for (const c of blocked) {
    if (selectedSet.has(c.book_id)) continue;
    nextState[c.book_id] = {
      days_shown: 0,
      cooldownUntil: dayIndex + safetyCooldownDays - 1,
    };
  }
  // 아직 끝나지 않은(내일 이후까지 가는) 쿨다운은 그대로 이월.
  for (const id of Object.keys(state)) {
    if (nextState[id]) continue;
    const p = prev(id);
    if (p.cooldownUntil > dayIndex) {
      nextState[id] = { days_shown: 0, cooldownUntil: p.cooldownUntil };
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

function activePins(pinRows, dateString, visibleBookIds) {
  const visible = new Set(visibleBookIds);
  const seenBooks = new Set();
  return pinRows
    .filter((p) => p && p.is_active === true && typeof p.book_id === 'string')
    .filter((p) => !p.start_date || p.start_date <= dateString)
    .filter((p) => !p.end_date || p.end_date >= dateString)
    .filter((p) => visible.has(p.book_id))
    .sort(
      (a, b) =>
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

function selectAutomaticCarousel(opts) {
  const {
    books = [],
    aggregates = [],
    rankedTrending = [],
    excludedIds = [],
    previousExposure = {},
    dayIndex,
    cooldownDays = 14,
    limit = 5,
  } = opts || {};
  const excluded = new Set(excludedIds);
  const eligible = books
    .filter(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        typeof b.image_url === 'string' &&
        b.image_url.trim() !== '' &&
        !excluded.has(b.id)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(eligible.map((b) => [b.id, b]));
  const aggregateById = new Map(aggregates.map((a) => [a.book_id, a]));
  const lastShown = (id) =>
    typeof previousExposure[id] === 'number'
      ? previousExposure[id]
      : Number.MIN_SAFE_INTEGER;
  const isCoolingDown = (id) => dayIndex - lastShown(id) < cooldownDays;
  const availableIds = new Set(
    eligible.filter((b) => !isCoolingDown(b.id)).map((b) => b.id)
  );
  const selected = [];
  const selectedSet = new Set();
  const take = (id) => {
    if (!id || !availableIds.has(id) || selectedSet.has(id) || selected.length >= limit) {
      return false;
    }
    selected.push(id);
    selectedSet.add(id);
    return true;
  };

  // 1) 최근 상승: 기존 트렌딩 전체 랭킹에서 홈 중복·쿨다운을 통과한 첫 책.
  for (const candidate of rankedTrending) {
    if (take(candidate.book_id)) break;
  }

  // 2) 꾸준히 읽힘: 남은 책을 최근 총 독서시간, 독자수, id 순으로 평가.
  const steady = aggregates
    .filter((a) => byId.has(a.book_id))
    .sort(
      (a, b) =>
        (b.total_read_time || 0) - (a.total_read_time || 0) ||
        (b.reader_count || 0) - (a.reader_count || 0) ||
        a.book_id.localeCompare(b.book_id)
    );
  for (const candidate of steady) {
    if (take(candidate.book_id)) break;
  }

  // 3) 카테고리 대표: 오늘의 시작 카테고리부터 순환하며 order가 높은 책.
  const categories = [...new Set(eligible.map((b) => String(b.category || '')))].sort();
  if (categories.length > 0) {
    const categoryStart = ((dayIndex % categories.length) + categories.length) % categories.length;
    for (let offset = 0; offset < categories.length; offset++) {
      const category = categories[(categoryStart + offset) % categories.length];
      const candidates = eligible
        .filter((b) => String(b.category || '') === category)
        .sort(
          (a, b) =>
            (Number(b.order) || 0) - (Number(a.order) || 0) ||
            lastShown(a.id) - lastShown(b.id) ||
            a.id.localeCompare(b.id)
        );
      if (candidates.some((b) => take(b.id))) break;
    }
  }

  // 4) 재발견: 최근 집계에 없는 책 중 가장 오래 미노출된 책.
  const dormant = eligible
    .filter((b) => !aggregateById.has(b.id))
    .sort((a, b) => lastShown(a.id) - lastShown(b.id) || a.id.localeCompare(b.id));
  for (const candidate of dormant) {
    if (take(candidate.id)) break;
  }

  // 5) 탐색: 남은 적격 후보를 날짜별 결정적 시작점에서 순환.
  const exploration = eligible.filter(
    (b) => availableIds.has(b.id) && !selectedSet.has(b.id)
  );
  if (exploration.length > 0) {
    const start = ((dayIndex % exploration.length) + exploration.length) % exploration.length;
    for (let i = 0; i < exploration.length; i++) {
      if (take(exploration[(start + i) % exploration.length].id)) break;
    }
  }

  // 역할 후보 부족 시 미노출 순으로 채우고, 그래도 부족하면 쿨다운을 완화한다.
  const oldestFirst = (a, b) =>
    lastShown(a.id) - lastShown(b.id) || a.id.localeCompare(b.id);
  for (const candidate of eligible.filter((b) => availableIds.has(b.id)).sort(oldestFirst)) {
    if (selected.length >= limit) break;
    take(candidate.id);
  }
  if (selected.length < limit) {
    for (const candidate of eligible.sort(oldestFirst)) {
      if (selected.length >= limit) break;
      if (!selectedSet.has(candidate.id)) {
        selected.push(candidate.id);
        selectedSet.add(candidate.id);
      }
    }
  }

  return selected;
}

function buildCarouselExposureState(previous, selectedIds, visibleIds, dayIndex) {
  const visible = new Set(visibleIds);
  const next = {};
  for (const [id, shownDay] of Object.entries(previous || {})) {
    if (visible.has(id) && typeof shownDay === 'number') next[id] = shownDay;
  }
  for (const id of selectedIds) next[id] = dayIndex;
  return next;
}

function buildAutoSuggestDocs(trending, discover) {
  return {
    _auto_trending: {
      auto: true,
      order: '0',
      title: '지금 인기',
      books: trending.map((t) => t.book_id),
    },
    _auto_discover: {
      auto: true,
      order: '00',
      title: '오늘의 발견',
      books: discover.slice(),
    },
  };
}

async function generateHomeDynamic(db, now = new Date()) {
  const cutoffISO = new Date(now.getTime() - TRENDING_WINDOW_DAYS * DAY_MS).toISOString();

  const rtSnap = await db
    .collection('read_time_logs')
    .where('createdAt', '>=', cutoffISO)
    .get();
  const logs = rtSnap.docs.map((d) => d.data());

  const booksSnap = await db.collection('books').where('hidden', '==', false).get();
  const books = booksSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const visibleIds = books.map((b) => b.id);
  // Discord 알림 등에서 책 제목을 보여주기 위한 id→title 맵(보이는 책 한정, 없으면 id 폴백).
  const titleById = new Map(
    books.map((b) => [b.id, b.title])
  );
  const titleOf = (id) => titleById.get(id) || id;

  const pinSnap = await db.collection('home_carousel_pins').get();
  const pins = activePins(
    pinSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })),
    kstDateString(now),
    visibleIds
  );
  const pinIds = pins.map((p) => p.book_id);

  // 수동 제외 목록(어드민) — 지금 인기/오늘의 발견 후보에서 영구 제외. 자동 큐레이션은
  // 그대로 돌되 빠진 자리는 다음 순위 책으로 자동 백필된다. (캐러셀/추천은 별도 핀으로 관리)
  const excludeSnap = await db.collection('home_dynamic_config').doc('main').get();
  const excludeList =
    excludeSnap.exists && Array.isArray((excludeSnap.data() || {}).exclude)
      ? excludeSnap.data().exclude.filter((x) => typeof x === 'string')
      : [];
  const excludeSet = new Set(excludeList);

  const aggregates = aggregateReaders(logs, now);
  const ranked = rankTrending(aggregates, {
    visibleIds,
    excludeIds: [...pinIds, ...excludeList],
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
    {
      limit: 8,
      exposurePenalty: EXPOSURE_PENALTY,
      safetyMaxDaysShown: SAFETY_MAX_DAYS_SHOWN,
      safetyCooldownDays: SAFETY_COOLDOWN_DAYS,
    }
  );

  const pinSet = new Set(pinIds);
  const trendingSet = new Set(trending.map((t) => t.book_id));
  const readSet = new Set(aggregates.map((a) => a.book_id));
  const basePool = visibleIds
    .filter((id) => !pinSet.has(id) && !trendingSet.has(id) && !excludeSet.has(id))
    .sort();
  const dormant = basePool.filter((id) => !readSet.has(id));
  const active = basePool.filter((id) => readSet.has(id));
  const orderedPool = dormant.concat(active);

  const discover = selectDiscover({ pool: orderedPool, dayIndex, window: 10 });

  const carouselStateRef = db.collection('home_dynamic').doc('_carousel_state');
  const carouselStateSnap = await carouselStateRef.get();
  const carouselState =
    (carouselStateSnap && carouselStateSnap.exists ? carouselStateSnap.data() : null) || {};
  const carouselBaseline =
    carouselState.day === dayIndex
      ? carouselState.baseline || {}
      : carouselState.last_shown_day_by_book || {};
  const trendingIds = trending.map((t) => t.book_id);
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

  const autoDocs = buildAutoSuggestDocs(trending, discover);

  const batch = db.batch();
  batch.set(db.collection('home_dynamic').doc('current'), {
    updated_at: now,
    date: kstDateString(now),
    carousel,
    // 저장 shape 은 기존대로 {book_id, reader_count} 만 (가중치/내부필드는 빼고).
    trending: trending.map((t) => ({ book_id: t.book_id, reader_count: t.reader_count })),
    discover,
  });
  batch.set(db.collection('suggest_group').doc('_auto_trending'), autoDocs._auto_trending);
  batch.set(db.collection('suggest_group').doc('_auto_discover'), autoDocs._auto_discover);
  // baseline = 이번 실행에 쓴 입력 상태. 같은 날 재실행 시 멱등성을 위해 함께 저장.
  batch.set(stateRef, { updated_at: now, day: dayIndex, state: nextState, baseline: prevState });
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
      is_new: Boolean(nextState[t.book_id] && nextState[t.book_id].days_shown === 1),
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

// P2-2: daily 집계 문서(dayly_reader_count / dayly_total_time)에서 aggregateReaders 동등 결과를 구성한다.
//
// 절감 효과: generateHomeDynamic 에서 read_time_logs 전건 스캔 대신 N개(= windowDays) doc 읽기.
//   현재 TRENDING_WINDOW_DAYS=3 이면 read-3docs vs 전건 스캔.
//
// ⚠️  알려진 한계(equivalence 불일치):
//   - 크로스데이 중복 독자: 같은 user 가 book A 를 월요일/화요일 모두 읽으면
//     각 날짜 reader_count 에 1씩 포함돼 합산 시 2 로 과다 카운트.
//     raw-log 방식은 user 당 '가장 최근 가중치'만 1회 반영해 1 이다.
//   - 영향: reader_count / weighted_readers 가 실제보다 높게 나와 트렌딩이
//     일별 재방문 독자가 많은 책에 유리하게 편향될 수 있음.
//   - 권장: generateHomeDynamic 교체 전에 1주일 병행 실행 후 결과 비교 필수.
//
// @param {FirebaseFirestore.Firestore} db
// @param {Date} now
// @param {number} windowDays
// @param {{ halfLife?: number }} opts
// @returns {Promise<Array<{book_id: string, reader_count: number, weighted_readers: number, total_read_time: number}>>}
async function aggregateReadersFromDailyDocs(db, now = new Date(), windowDays = TRENDING_WINDOW_DAYS, opts = {}) {
  const halfLife = opts.halfLife || HALFLIFE_DAYS;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const dateStrings = [];
  for (let d = 0; d < windowDays; d++) {
    const t = new Date(nowMs - d * DAY_MS);
    dateStrings.push(kstDateString(t));
  }

  // N개 일별 집계 문서를 병렬 조회
  const [readerSnaps, timeSnaps] = await Promise.all([
    Promise.all(dateStrings.map((date) => db.collection('dayly_reader_count').doc(date).get())),
    Promise.all(dateStrings.map((date) => db.collection('dayly_total_time').doc(date).get())),
  ]);

  // book별 가중 독자 합산 및 총 독서시간
  const bookMap = new Map(); // book_id → { reader_count_approx, weighted_readers, total_read_time }

  for (let i = 0; i < dateStrings.length; i++) {
    const daysAgo = i; // 오늘=0, 어제=1, ...
    const w = decayWeight(daysAgo, halfLife);

    const readerSnap = readerSnaps[i];
    if (readerSnap.exists) {
      const rc = (readerSnap.data() || {}).reader_count || {};
      for (const [book_id, cnt] of Object.entries(rc)) {
        let e = bookMap.get(book_id);
        if (!e) {
          e = { reader_count: 0, weighted_readers: 0, total_read_time: 0 };
          bookMap.set(book_id, e);
        }
        e.reader_count += cnt;          // 크로스데이 중복 포함(알려진 한계)
        e.weighted_readers += cnt * w;  // 날짜별 감쇠 적용
      }
    }

    const timeSnap = timeSnaps[i];
    if (timeSnap.exists) {
      const tc = (timeSnap.data() || {}).total_count || {};
      for (const [book_id, sec] of Object.entries(tc)) {
        let e = bookMap.get(book_id);
        if (!e) {
          e = { reader_count: 0, weighted_readers: 0, total_read_time: 0 };
          bookMap.set(book_id, e);
        }
        e.total_read_time += sec;
      }
    }
  }

  return [...bookMap.entries()].map(([book_id, e]) => ({
    book_id,
    reader_count: e.reader_count,
    weighted_readers: e.weighted_readers,
    total_read_time: e.total_read_time,
  }));
}

module.exports = {
  // 튜닝 상수 (테스트/문서용 노출)
  TRENDING_WINDOW_DAYS,
  HALFLIFE_DAYS,
  EXPOSURE_PENALTY,
  SAFETY_MAX_DAYS_SHOWN,
  SAFETY_COOLDOWN_DAYS,
  decayWeight,
  scoreOf,
  kstDateString,
  kstDayIndex,
  aggregateReaders,
  rankTrending,
  selectTrending,
  selectTrendingWithCooldown,
  selectDiscover,
  activePins,
  mergeCarouselPins,
  selectAutomaticCarousel,
  buildCarouselExposureState,
  buildAutoSuggestDocs,
  generateHomeDynamic,
  formatCurationMessage,
  aggregateReadersFromDailyDocs,
};
