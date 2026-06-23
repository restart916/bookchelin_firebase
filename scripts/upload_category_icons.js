'use strict';
/**
 * book_category_v2 아이콘을 앱 v1 에셋(cat_00X.png)과 동일하게 Storage 업로드 후
 * book_category_v2.icon_url + book_category.icon_url(레거시 id "1"~"6")을 기록한다.
 *
 * 매핑 근거 (Flutter lib/src/widgets/category_view.dart):
 *   assetIndex = int.parse(category.order) + 1  →  "cat_00{assetIndex}.png"
 *   order "0" = 이어보기(대여함) 특수탭 = cat_001 (카테고리 아님, 제외)
 *   order 1 → cat_002, order 2 → cat_003, ..., order 6 → cat_007
 *
 * 실행: node scripts/upload_category_icons.js
 */

const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
  storageBucket: 'bookchelin.appspot.com',
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const FLUTTER_ASSETS = path.join(
  __dirname,
  '../../bookchelin_flutter/assets/images',
);

async function uploadIcon(localPath, destPath) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=2592000',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    destPath,
  )}?alt=media&token=${token}`;
}

async function main() {
  // book_category_v2 읽기
  const v2Snap = await db.collection('book_category_v2').get();
  const v2Docs = v2Snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  console.log(`book_category_v2: ${v2Docs.length}개\n`);

  // book_category (레거시) 읽기 — icon_url 동시 업데이트용
  const legacySnap = await db.collection('book_category').get();
  const legacyByIdField = {};
  for (const d of legacySnap.docs) {
    const data = d.data();
    legacyByIdField[String(data.id)] = { docId: d.id, ...data };
  }

  const LEGACY_IDS = new Set(['1', '2', '3', '4', '5', '6']);

  let success = 0;
  let skipped = 0;

  for (const cat of v2Docs) {
    const order = typeof cat.order === 'number' ? cat.order : parseInt(cat.order, 10);
    if (isNaN(order) || order < 1 || order > 6) {
      console.log(`  [${cat.id}] ${cat.name} order=${cat.order} → 범위 외, 스킵`);
      skipped++;
      continue;
    }

    const assetIndex = order + 1; // Flutter 매핑: order + 1
    const assetFile = `cat_00${assetIndex}.png`;
    const localPath = path.join(FLUTTER_ASSETS, assetFile);
    const destPath = `category-icons/${cat.id}.png`;

    console.log(`  [id=${cat.id}] ${cat.name}  order=${order} → ${assetFile} → ${destPath}`);

    try {
      const url = await uploadIcon(localPath, destPath);
      console.log(`    ✓ 업로드 완료. URL: ${url.slice(0, 80)}…`);

      // book_category_v2 업데이트
      await db.collection('book_category_v2').doc(cat.id).update({ icon_url: url });

      // book_category (레거시) 동시 업데이트 (id "1"~"6"만)
      const catId = String(cat.id);
      if (LEGACY_IDS.has(catId) && legacyByIdField[catId]) {
        const legacyDocId = legacyByIdField[catId].docId;
        await db.collection('book_category').doc(legacyDocId).update({ icon_url: url });
        console.log(`    ✓ book_category[${legacyDocId}] icon_url 동기화`);
      }

      success++;
    } catch (e) {
      console.error(`    ✗ 실패: ${e.message}`);
    }
  }

  console.log(`\n완료: 성공 ${success}개, 스킵 ${skipped}개`);
}

main().catch(e => { console.error(e); process.exit(1); });
