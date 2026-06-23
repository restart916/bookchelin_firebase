/**
 * book_category_v2 초기 시드 스크립트.
 * 기존 book_category(6개)를 기반으로 book_category_v2 문서를 생성한다.
 * 멱등: 기존 문서가 있으면 icon_url이 비어있는 경우에만 overwrite.
 *
 * 실행: node scripts/seed_category_v2.js
 */
const admin = require('firebase-admin');
const key = require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

// book_category 의 order 필드(string "1"~"6")를 number로 변환
const ORDER_MAP = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

async function main() {
  const legacySnap = await db.collection('book_category').get();
  const legacy = legacySnap.docs.map(d => d.data());
  console.log(`book_category 읽기: ${legacy.length}개`);

  let created = 0;
  let skipped = 0;

  for (const cat of legacy) {
    const catId = String(cat.id);
    const docRef = db.collection('book_category_v2').doc(catId);
    const existing = await docRef.get();

    if (existing.exists && existing.data().icon_url) {
      console.log(`  [${catId}] ${cat.name} → 이미 존재(icon_url 있음), 스킵`);
      skipped++;
      continue;
    }

    const data = {
      id: catId,
      name: cat.name,
      order: ORDER_MAP[cat.order] ?? parseInt(cat.order, 10),
      icon_url: '',          // 어드민에서 업로드 후 채움
      description: '',
      hidden: false,
    };

    await docRef.set(data, { merge: false });
    console.log(`  [${catId}] ${cat.name} → 생성 (order: ${data.order})`);
    created++;
  }

  console.log(`\n완료: 생성 ${created}개, 스킵 ${skipped}개`);
  console.log('book_category 원본은 변경 없음.');
}

main().catch(console.error).finally(() => process.exit());
