/**
 * limit_event / time_event 의 read_history 배열을 서브컬렉션으로 이전 (Phase A).
 *
 * Phase A: 1MB 도큐먼트 한계에 부딪힌 아래 두 문서만 우선 이전합니다.
 *   - limit_event/ugdL76sjvTAHDBztsmYo
 *   - time_event/2EYEQH75I25oJS0Y5hdj
 *
 * 이전 후 구조:
 *   parent doc 에 read_history: [], has_subcollection_history: true,
 *   user_count, total_read_time 필드를 기록하고,
 *   각 사용자별 기록은 parent/read_history/{user_uid} 서브컬렉션 도큐먼트로
 *   분리합니다. (time_event 는 remain_time 도 재계산.)
 *
 * Cloud Functions (updateTimeEvent / updateLimitEvent / get_limit_events*)
 * 는 has_subcollection_history === true 인 문서에 한해 서브컬렉션 경로를
 * 사용하고, 그 외(아직 이전되지 않은 문서)는 기존 배열 경로를 그대로 씁니다.
 * Phase B 에서 나머지 문서를 일괄 이전할 예정입니다.
 *
 * 사용법 (택1):
 *   1) 서비스 계정 키 파일을 ./serviceAccountKey.json 으로 두고:
 *        node scripts/migrate_event_history_phase_a.js
 *   2) GOOGLE_APPLICATION_CREDENTIALS 환경 변수로 키 경로 지정:
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *          node scripts/migrate_event_history_phase_a.js
 *
 * 안전성:
 *   - 이미 has_subcollection_history === true 인 문서는 건너뜁니다.
 *   - 서브컬렉션 쓰기는 500개 단위 batch 로 끊어 커밋합니다.
 *   - parent 문서 update 는 모든 서브컬렉션 쓰기가 끝난 후 마지막에 수행합니다.
 *
 * 주의: 서비스 계정 키 파일은 절대 커밋하지 마세요.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(KEY_PATH)) {
  // eslint-disable-next-line global-require
  const serviceAccount = require(KEY_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
} else {
  console.error(
    '서비스 계정 키를 찾을 수 없습니다. scripts/serviceAccountKey.json 을 두거나 ' +
      'GOOGLE_APPLICATION_CREDENTIALS 환경 변수를 설정하세요.'
  );
  process.exit(1);
}

const TARGETS = [
  { collection: 'limit_event', docId: 'ugdL76sjvTAHDBztsmYo' },
  { collection: 'time_event', docId: '2EYEQH75I25oJS0Y5hdj' },
];

const BATCH_LIMIT = 500;

async function migrateOne(db, target) {
  const { collection, docId } = target;
  const parentRef = db.collection(collection).doc(docId);
  const snap = await parentRef.get();

  if (!snap.exists) {
    console.warn(`[${collection}/${docId}] 문서가 존재하지 않습니다. 건너뜀.`);
    return;
  }

  const data = snap.data() || {};

  if (data.has_subcollection_history === true) {
    console.log(
      `[${collection}/${docId}] 이미 이전 완료 (has_subcollection_history=true). 건너뜀.`
    );
    return;
  }

  const readHistory = Array.isArray(data.read_history) ? data.read_history : [];
  console.log(
    `[${collection}/${docId}] read_history 항목 ${readHistory.length}개 이전 시작.`
  );

  // 서브컬렉션 쓰기 (500개씩 batch).
  let batch = db.batch();
  let opsInBatch = 0;
  let writtenSubDocs = 0;
  let skippedNoUid = 0;
  let totalReadTime = 0;

  for (const entry of readHistory) {
    if (!entry || typeof entry !== 'object') {
      skippedNoUid += 1;
      continue;
    }
    const userUid = entry.user_uid;
    if (!userUid || typeof userUid !== 'string') {
      skippedNoUid += 1;
      continue;
    }

    // user_uid 는 도큐먼트 id 로 들어가므로 본문에서 제거.
    const subDocBody = Object.assign({}, entry);
    delete subDocBody.user_uid;

    if (collection === 'limit_event') {
      const t = typeof entry.total_time === 'number' ? entry.total_time : 0;
      totalReadTime += t;
    } else if (collection === 'time_event') {
      const t = typeof entry.read_time === 'number' ? entry.read_time : 0;
      totalReadTime += t;
    }

    const subRef = parentRef.collection('read_history').doc(userUid);
    batch.set(subRef, subDocBody);
    opsInBatch += 1;
    writtenSubDocs += 1;

    if (opsInBatch >= BATCH_LIMIT) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      console.log(
        `[${collection}/${docId}] 서브컬렉션 batch 커밋 (${writtenSubDocs}/${readHistory.length})`
      );
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
    console.log(
      `[${collection}/${docId}] 서브컬렉션 batch 커밋 (${writtenSubDocs}/${readHistory.length}) - 마지막`
    );
  }

  // parent 문서 update.
  const userCount = writtenSubDocs;
  const parentUpdate = {
    read_history: [],
    has_subcollection_history: true,
    user_count: userCount,
    total_read_time: totalReadTime,
  };

  if (collection === 'time_event') {
    const eventMinute =
      typeof data.event_minute === 'number' ? data.event_minute : 0;
    const remain = eventMinute - totalReadTime;
    parentUpdate.remain_time = remain < 0 ? 0 : remain;
  }

  await parentRef.update(parentUpdate);

  console.log(
    `[${collection}/${docId}] 완료. ` +
      `user_count=${userCount}, total_read_time=${totalReadTime}` +
      (collection === 'time_event'
        ? `, remain_time=${parentUpdate.remain_time}`
        : '') +
      (skippedNoUid > 0 ? `, user_uid 누락 ${skippedNoUid}건 건너뜀` : '')
  );
}

async function main() {
  const db = admin.firestore();

  for (const target of TARGETS) {
    // eslint-disable-next-line no-await-in-loop
    await migrateOne(db, target);
  }

  console.log('Phase A 이전 완료.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
