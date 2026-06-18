/**
 * 일간 큐레이션(daily curation) 기록 검증 스크립트.
 *
 * daily_job(매일 KST 00:00) → generateHomeDynamic(db) 가 Firestore 에 남기는
 * 큐레이션 결과가 실제로 존재/갱신되고 있는지 확인합니다.
 *
 * 핵심 사실(코드 분석):
 *   - 큐레이션 결과는 home_dynamic/current "단일 문서"에 매일 덮어쓰기(set) 됩니다.
 *     → 날짜별 히스토리가 쌓이지 않습니다. current.date = "마지막 실행 날짜".
 *   - 자동 캐러셀 5권의 노출/당일 기준 상태는 home_dynamic/_carousel_state 에,
 *     수동 고정 책은 home_carousel_pins 컬렉션에 저장됩니다.
 *   - 같은 daily_job 이 매일 per-date 로 남기는 사이드 컬렉션
 *     (dayly_total / dayly_total_time / analytics_dau)이 "매일 실행됐는지"의 증거입니다.
 *
 * 사용법:
 *   node scripts/verify_daily_curation.js
 *   (서비스 계정 키: scripts/bookchelin-firebase-adminsdk-crofb-8c813abbcb.json 자동 사용,
 *    또는 GOOGLE_APPLICATION_CREDENTIALS 환경변수)
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }
  const candidates = fs
    .readdirSync(__dirname)
    .filter((f) => /-adminsdk-.*\.json$/.test(f) || f === 'serviceAccountKey.json');
  if (!candidates.length) {
    throw new Error('서비스 계정 키를 찾을 수 없습니다 (scripts/*-adminsdk-*.json).');
  }
  return admin.credential.cert(require(path.join(__dirname, candidates[0])));
}

admin.initializeApp({ credential: loadCredential() });
const db = admin.firestore();

const ts = (v) => (v && v.toDate ? v.toDate().toISOString() : v);
const dateIds = (snap) =>
  snap.docs.map((d) => d.id).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
const kstDateString = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

(async () => {
  // 1) 큐레이션이 쓰는 단일 문서
  const cur = await db.collection('home_dynamic').doc('current').get();
  console.log('\n=== home_dynamic/current (큐레이션 결과 본체) ===');
  if (cur.exists) {
    const d = cur.data();
    console.log('  존재함 ✅');
    console.log('  date(마지막 큐레이션 날짜):', d.date);
    console.log('  updated_at:', ts(d.updated_at));
    console.log('  trending:', (d.trending || []).length,
      '| discover:', (d.discover || []).length,
      '| carousel:', (d.carousel || []).length);
    console.log('  carousel ids:', (d.carousel || []).map((book) => book.id).join(', '));
  } else {
    console.log('  ❌ 없음 — 큐레이션이 한 번도 성공적으로 쓰이지 않았을 수 있음');
  }

  const st = await db.collection('home_dynamic').doc('_trending_state').get();
  console.log('\n=== home_dynamic/_trending_state (트렌딩 streak/cooldown 상태) ===');
  if (st.exists) {
    const d = st.data();
    console.log('  존재함 ✅  day(index):', d.day, '| updated_at:', ts(d.updated_at));
  } else {
    console.log('  ❌ 없음');
  }

  const carouselState = await db.collection('home_dynamic').doc('_carousel_state').get();
  console.log('\n=== home_dynamic/_carousel_state (자동 캐러셀 노출 상태) ===');
  if (carouselState.exists) {
    const d = carouselState.data();
    console.log('  존재함 ✅  day(index):', d.day, '| updated_at:', ts(d.updated_at));
    console.log('  당일 자동 5권 기준:', (d.baseline_ids || []).join(', '));
    console.log('  노출 이력 책 수:', Object.keys(d.last_shown_day || {}).length);
  } else {
    console.log('  ❌ 없음 — 새 자동 캐러셀이 아직 생성되지 않았을 수 있음');
  }

  const today = kstDateString();
  const pins = await db.collection('home_carousel_pins').get();
  const pinRows = pins.docs.map((doc) => ({id: doc.id, ...doc.data()})).sort((a, b) =>
    (Number(a.position) || Number.MAX_SAFE_INTEGER) -
      (Number(b.position) || Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  console.log(`\n=== home_carousel_pins (수동 핀 ${pins.size}개, KST ${today}) ===`);
  pinRows.forEach((pin) => {
    const active = pin.is_active !== false &&
      (!pin.start_date || pin.start_date <= today) &&
      (!pin.end_date || pin.end_date >= today);
    console.log(`  ${active ? '✅' : '⏸️'} #${pin.position} ${pin.book_id}` +
      ` | ${pin.start_date || '즉시'} ~ ${pin.end_date || '계속'} | doc=${pin.id}`);
  });
  if (!pinRows.length) console.log('  등록된 핀 없음');

  // home_dynamic 컬렉션 전체 문서 — 날짜별 히스토리 문서가 있는지 확인
  const all = await db.collection('home_dynamic').get();
  console.log(`\n=== home_dynamic 컬렉션 전체 문서 (${all.size}개) ===`);
  all.docs.forEach((x) => console.log('  -', x.id));

  // 2) suggest_group 자동행
  console.log('\n=== suggest_group 자동행 ===');
  for (const id of ['_auto_trending', '_auto_discover']) {
    const s = await db.collection('suggest_group').doc(id).get();
    console.log(`  ${id}:`, s.exists ? `books=${(s.data().books || []).length}` : '없음');
  }

  // 3) daily_job 가 per-date 로 남기는 사이드 컬렉션 (매일 실행 증거)
  console.log('\n=== per-date 사이드 컬렉션 (daily_job 실행 증거) ===');
  for (const c of ['dayly_total', 'dayly_total_time', 'dayly_total_time_by_user', 'analytics_dau']) {
    try {
      const snap = await db.collection(c).get();
      const ids = dateIds(snap);
      console.log(`  ${c}: 총 ${snap.size}개, 날짜형 ${ids.length}개`
        + (ids.length ? ` | 범위 ${ids[0]} ~ ${ids[ids.length - 1]} | 최근5: ${ids.slice(-5).join(', ')}` : ''));
    } catch (e) {
      console.log(`  ${c}: 조회 실패 (${e.message})`);
    }
  }

  console.log('\n완료.');
  process.exit(0);
})().catch((e) => {
  console.error('오류:', e.message);
  process.exit(1);
});
