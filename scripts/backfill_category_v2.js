'use strict';
/**
 * books.category_v2 백필 스크립트.
 * category_v2 필드가 없거나 빈 books 문서에 category 필드 값을 복사한다.
 * 이미 category_v2가 있으면 건드리지 않는다.
 *
 * 근거: book_category_v2는 v1과 동일 id("1"~"6") 체계를 사용하므로 1:1 매핑 가능.
 * 구앱은 category_v2 필드를 무시하므로 무영향.
 *
 * 실행: node scripts/backfill_category_v2.js [--dry-run]
 */

const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

async function main() {
  console.log(`모드: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let updated = 0;
  let skipped = 0;
  let noCategory = 0;
  let pageToken = undefined;

  do {
    let query = db.collection('books').limit(500);
    if (pageToken) query = query.startAfter(pageToken);

    const snap = await query.get();
    if (snap.empty) break;
    pageToken = snap.docs[snap.docs.length - 1];

    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const categoryV2 = data.category_v2;
      const category = data.category;

      if (categoryV2 !== undefined && categoryV2 !== null && categoryV2 !== '') {
        skipped++;
        continue;
      }
      if (!category) {
        noCategory++;
        continue;
      }

      console.log(
        `  ${DRY_RUN ? '[DRY] ' : ''}${doc.id.slice(0, 8)}…  category=${category} → category_v2=${category}  (${data.title?.slice(0, 20) ?? '제목없음'})`,
      );

      if (!DRY_RUN) {
        batch.update(doc.ref, { category_v2: category });
        batchCount++;
        updated++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      } else {
        updated++;
      }
    }

    if (!DRY_RUN && batchCount > 0) {
      await batch.commit();
    }
  } while (pageToken);

  console.log(`\n완료: 업데이트 ${updated}건, 이미존재 스킵 ${skipped}건, category없음 ${noCategory}건`);
  if (DRY_RUN) console.log('(DRY RUN — Firestore 변경 없음)');
}

main().catch(e => { console.error(e); process.exit(1); });
