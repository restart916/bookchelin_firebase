'use strict';
/**
 * publisher 필드 정리 스크립트.
 *
 * 1) "도로교통공단" 포함 books 목록 출력
 * 2) 그 책들의 publisher 필드를 "" 로 변경
 * 3) publisher 컬렉션의 code와 매칭되지 않는 "고아" publisher 값 전수 확인 후 목록 출력
 * 4) 변경 후 확인
 *
 * 실행: node scripts/fix_publisher_orphans.js [--dry-run]
 */
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`모드: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // ── 1. publisher 컬렉션 code 목록 수집 ──────────────────────────
  const pubSnap = await db.collection('publisher').get();
  const validCodes = new Set(pubSnap.docs.map(d => d.data().code).filter(Boolean));
  console.log(`등록된 출판사 코드 ${validCodes.size}개: ${[...validCodes].join(', ')}\n`);

  // ── 2. books 전체 로드 (publisher 필드 분석용) ───────────────────
  const booksSnap = await db.collection('books').get();
  console.log(`books 총 ${booksSnap.docs.length}건 로드 완료\n`);

  const doroBooks = [];    // 도로교통공단 변형
  const orphanMap = {};    // code → [{ id, title }]

  for (const doc of booksSnap.docs) {
    const data = doc.data();
    const pub = data.publisher || '';
    if (!pub) continue; // 이미 ""이면 정상

    if (pub.includes('도로교통공단')) {
      doroBooks.push({ id: doc.id, title: data.title, publisher: pub });
    } else if (!validCodes.has(pub)) {
      if (!orphanMap[pub]) orphanMap[pub] = [];
      orphanMap[pub].push({ id: doc.id, title: data.title });
    }
  }

  // ── 3. 도로교통공단 책 목록 출력 ──────────────────────────────────
  console.log(`=== 도로교통공단 책 (${doroBooks.length}건) ===`);
  for (const b of doroBooks) {
    console.log(`  [${b.id}] "${b.title}"  publisher="${b.publisher}"`);
  }
  console.log();

  // ── 4. 도로교통공단 books publisher → "" 변경 ──────────────────
  if (doroBooks.length > 0) {
    let batch = db.batch();
    let i = 0;
    for (const b of doroBooks) {
      console.log(`  ${DRY_RUN ? '[DRY] ' : ''}publisher="" 설정: [${b.id}] "${b.title}"`);
      if (!DRY_RUN) {
        batch.update(db.collection('books').doc(b.id), { publisher: '' });
        i++;
        if (i % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
    }
    if (!DRY_RUN && i % 400 !== 0) await batch.commit();
    console.log(`\n도로교통공단 ${doroBooks.length}건 ${DRY_RUN ? '(DRY — 실제 변경 없음)' : '변경 완료'}\n`);
  } else {
    console.log('(도로교통공단 해당 책 없음)\n');
  }

  // ── 5. 고아 publisher 값 전수 보고 ────────────────────────────────
  const orphanKeys = Object.keys(orphanMap).sort();
  console.log(`=== 기타 고아 publisher 값 (${orphanKeys.length}종) ===`);
  if (orphanKeys.length === 0) {
    console.log('  (없음 — 모든 non-empty publisher가 유효한 코드임)');
  } else {
    for (const code of orphanKeys) {
      const books = orphanMap[code];
      console.log(`\n  publisher="${code}" (${books.length}건):`);
      for (const b of books) {
        console.log(`    - [${b.id}] "${b.title}"`);
      }
    }
  }
  console.log();

  // ── 6. 변경 후 확인 (LIVE 모드만) ────────────────────────────────
  if (!DRY_RUN && doroBooks.length > 0) {
    console.log('=== 변경 후 확인 ===');
    for (const b of doroBooks) {
      const snap = await db.collection('books').doc(b.id).get();
      const val = snap.exists ? (snap.data().publisher || '""') : '(문서없음)';
      console.log(`  [${b.id}] publisher=${val}`);
    }
    console.log();
  }

  console.log('완료.');
}

main().catch(e => { console.error(e); process.exit(1); });
