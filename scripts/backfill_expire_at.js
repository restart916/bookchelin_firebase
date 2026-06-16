// [DO NOT RUN IN PRODUCTION WITHOUT REVIEW]
// read_time_logs 기존 문서에 expireAt 필드를 소급 부여하는 스크립트.
//
// 사용 시기: Firestore 네이티브 TTL을 활성화한 뒤, 기존 로그에도 TTL을 적용하고 싶을 때.
//   1. Firebase Console → Firestore → Indexes → TTL → read_time_logs / expireAt 정책 생성
//   2. 이 스크립트로 기존 문서에 expireAt 추가 (배치 500건)
//
// ⚠️  주의: 대량 쓰기(건당 1 write). 수십만 건이면 비용과 시간이 상당함.
//    --dry-run 플래그로 먼저 건수를 확인할 것.
//
// 실행: node backfill_expire_at.js [--dry-run] [--limit N]

'use strict';
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  `${__dirname}/bookchelin-firebase-adminsdk-crofb-8c813abbcb.json`;
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });

const db = admin.firestore();
const RETENTION_DAYS = 180; // functions/index.js의 RETENTION_DAYS와 동일하게 유지
const BATCH_SIZE = 500;

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

async function main() {
  console.log(`backfill_expire_at: DRY_RUN=${DRY_RUN}, LIMIT=${LIMIT}`);

  let query = db.collection('read_time_logs').orderBy('__name__');
  let totalProcessed = 0;
  let totalSkipped = 0;
  let lastDoc = null;

  while (true) {
    const q = lastDoc ? query.startAfter(lastDoc).limit(BATCH_SIZE) : query.limit(BATCH_SIZE);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      if (totalProcessed + batchCount >= LIMIT) break;
      const data = doc.data();
      if ('expireAt' in data) {
        totalSkipped++;
        continue;
      }
      const createdAt = data.createdAt;
      let baseDate;
      if (createdAt && typeof createdAt.toDate === 'function') {
        baseDate = createdAt.toDate();
      } else if (typeof createdAt === 'string') {
        baseDate = new Date(createdAt);
      } else {
        // createdAt 없음 → 현재 시간 기준
        baseDate = new Date();
      }
      const expire = new Date(baseDate.getTime() + RETENTION_DAYS * 86400000);
      if (!DRY_RUN) {
        batch.update(doc.ref, {
          expireAt: admin.firestore.Timestamp.fromDate(expire),
        });
      }
      batchCount++;
    }

    if (!DRY_RUN && batchCount > 0) await batch.commit();
    totalProcessed += batchCount;
    console.log(`processed=${totalProcessed}, skipped=${totalSkipped}`);

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE || totalProcessed >= LIMIT) break;
  }

  console.log(`완료: written=${totalProcessed}, skipped_already_set=${totalSkipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
