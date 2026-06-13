// clean_spam_reviews.js — 명백한 도배/무의미 리뷰에 is_hide:true 플래그.
// 삭제하지 않고 숨김 처리(되돌리기 가능). 기본 dry-run, --apply 로 실제 반영.
// 기준은 "확실한 것만" — 정상 리뷰(굿, ★★★★, 너~~~무, 헐!!! 등)는 보호.

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
});
const db = admin.firestore();

// 도배 사유 판별 (null 이면 정상).
// 안전 우선: 완성형 글자(가-힣·영문·숫자)나 이모지가 하나라도 있으면 살린다.
// 그래야 "ㅎㄷㄷㄷ너무 무섭다"(감탄사+내용), "👍👍👍"(긍정) 같은 정상 리뷰를 안 건드린다.
// 완성형이 섞인 난타("혀ㅛ료로…")는 잡지 못하지만, 그건 어드민에서 수동 숨김.
function spamReason(raw) {
  const t = (raw || '').trim();
  if (!t) return 'empty'; // 빈 리뷰/공백만
  const meaningful = (t.match(/[가-힣a-zA-Z0-9]/g) || []).length; // 완성형 한글·영문·숫자
  const hasEmoji = /\p{Emoji_Presentation}/u.test(t); // 👍 등 그림 이모지
  if (meaningful === 0 && !hasEmoji && !t.includes('★')) return 'no-letter'; // ㅎ, ㄷ, ., !, ㅋㅋ …
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const snap = await db.collection('book_reviews').get();
  const hits = [];
  snap.forEach((d) => {
    const r = d.data();
    if (r.hide === '1') return; // 이미 숨김 (클라이언트/web_book 공용 필드 = hide:"1")
    const reason = spamReason(r.review);
    if (reason) hits.push({ id: d.id, reason, text: (r.review || '').trim().slice(0, 50), rating: r.rating });
  });

  const byReason = {};
  hits.forEach((h) => { byReason[h.reason] = (byReason[h.reason] || 0) + 1; });
  console.log(`전체 ${snap.size}건 중 도배 의심 ${hits.length}건`);
  console.log('사유별:', JSON.stringify(byReason));
  console.log('--- 샘플 (검수용) ---');
  hits.slice(0, 40).forEach((h) => console.log(`[${h.reason}] ★${h.rating} "${h.text}"`));

  if (!apply) {
    console.log('\n(dry-run — --apply 로 실제 is_hide:true 처리)');
    return;
  }

  let n = 0;
  let batch = db.batch();
  for (const h of hits) {
    batch.update(db.collection('book_reviews').doc(h.id), { hide: '1' });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\n✅ ${hits.length}건 hide:"1" 처리 완료 (되돌리려면 어드민에서 '다시 보이기')`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
