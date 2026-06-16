// [DO NOT RUN IN PRODUCTION WITHOUT REVIEW]
// Storage 기존 표지(cover/) · EPUB(epub/) 파일에 Cache-Control 헤더를 소급 부여하는 스크립트.
//
// 사용 시기: upload_gongu_books.js 에 cacheControl 추가 이전에 업로드된 파일에 적용할 때.
//
// ⚠️  주의: 파일 수 × metadata update 요청. 수백 건이면 몇 분, 수천 건은 더 걸린다.
//    --dry-run 플래그로 대상 파일 수를 먼저 확인할 것.
//
// 실행: node backfill_storage_cache_headers.js [--dry-run] [--prefix epub/] [--prefix cover/]

'use strict';
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  `${__dirname}/bookchelin-firebase-adminsdk-crofb-8c813abbcb.json`;
admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
  storageBucket: 'bookchelin.appspot.com',
});

const bucket = admin.storage().bucket();
const CACHE_CONTROL = 'public, max-age=2592000';
const DRY_RUN = process.argv.includes('--dry-run');

// --prefix 인자가 없으면 cover/ 와 epub/ 모두 처리
const prefixArgs = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--prefix' && process.argv[i + 1]) {
    prefixArgs.push(process.argv[i + 1]);
  }
}
const PREFIXES = prefixArgs.length > 0 ? prefixArgs : ['cover/', 'epub/'];

async function processPrefix(prefix) {
  let updated = 0;
  let skipped = 0;
  let pageToken;

  do {
    const [files, , meta] = await bucket.getFiles({ prefix, maxResults: 500, pageToken });
    pageToken = meta && meta.pageToken;

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (metadata.cacheControl === CACHE_CONTROL) {
        skipped++;
        continue;
      }
      console.log(`${DRY_RUN ? '[DRY] ' : ''}${file.name}`);
      if (!DRY_RUN) {
        await file.setMetadata({ cacheControl: CACHE_CONTROL });
      }
      updated++;
    }
  } while (pageToken);

  return { updated, skipped };
}

async function main() {
  console.log(`backfill_storage_cache_headers: DRY_RUN=${DRY_RUN}, prefixes=${PREFIXES.join(', ')}`);
  let totalUpdated = 0;
  let totalSkipped = 0;
  for (const prefix of PREFIXES) {
    const { updated, skipped } = await processPrefix(prefix);
    console.log(`prefix=${prefix}: updated=${updated}, skipped_already_set=${skipped}`);
    totalUpdated += updated;
    totalSkipped += skipped;
  }
  console.log(`완료: total_updated=${totalUpdated}, total_skipped=${totalSkipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
