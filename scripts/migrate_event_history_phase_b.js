/**
 * limit_event / time_event 의 read_history 배열을 서브컬렉션으로 이전 (Phase B).
 *
 * Phase A 에서는 1MB 문서 한계에 부딪힌 2개 문서만 우선 이전했고,
 * Phase B 에서는 limit_event / time_event 컬렉션의 모든 나머지 문서를
 * 동일한 구조(서브컬렉션)로 일괄 이전합니다.
 *
 * 이전 후 구조 (Phase A 와 동일):
 *   parent doc 에 read_history: [], has_subcollection_history: true,
 *   user_count, total_read_time 필드를 기록하고,
 *   각 사용자별 기록은 parent/read_history/{user_uid} 서브컬렉션 도큐먼트로
 *   분리합니다. (time_event 는 remain_time 도 재계산.)
 *
 * read_history 가 비어있거나 없는 문서에도 일관성을 위해 marker 필드
 * (has_subcollection_history: true, user_count: 0, total_read_time: 0,
 * time_event 의 경우 remain_time = event_minute) 만 부착합니다.
 *
 * Cloud Functions (updateTimeEvent / updateLimitEvent / get_limit_events*)
 * 는 이미 dual-mode 로 동작하므로 Phase B 진행 중에도 안전합니다.
 *
 * 사용법 (택1):
 *   1) 서비스 계정 키 파일을 ./serviceAccountKey.json 으로 두고:
 *        node scripts/migrate_event_history_phase_b.js
 *      (실제 쓰기 없이 미리보기만 하려면 --dry-run 플래그 추가)
 *        node scripts/migrate_event_history_phase_b.js --dry-run
 *   2) GOOGLE_APPLICATION_CREDENTIALS 환경 변수로 키 경로 지정:
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *          node scripts/migrate_event_history_phase_b.js
 *
 * 안전성 / 재실행성:
 *   - 이미 has_subcollection_history === true 인 문서는 건너뜁니다.
 *     (Phase A 문서 포함)
 *   - 문서별로 순차 처리 (병렬 X). 메모리/경합 예측 가능.
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

const COLLECTIONS = ['limit_event', 'time_event'];
const BATCH_LIMIT = 500;
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * read_history 배열을 분석해 서브컬렉션에 들어갈 sub doc 목록과
 * parent 에 기록할 집계 값 (user_count, total_read_time) 을 계산합니다.
 * Phase A 의 로직을 동일하게 옮겨온 것입니다.
 */
function summarizeReadHistory(collection, readHistory) {
  const subDocs = []; // { userUid, body }
  let totalReadTime = 0;
  let skippedNoUid = 0;

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

    subDocs.push({ userUid, body: subDocBody });
  }

  return { subDocs, totalReadTime, skippedNoUid };
}

async function migrateOne(db, collection, docSnap) {
  const docId = docSnap.id;
  const parentRef = docSnap.ref;
  const data = docSnap.data() || {};

  if (data.has_subcollection_history === true) {
    console.log(
      `[${collection}/${docId}] 이미 이전 완료 (has_subcollection_history=true). 건너뜀.`
    );
    return 'skipped_already';
  }

  const readHistory = Array.isArray(data.read_history) ? data.read_history : [];

  // 빈 read_history 인 경우: 서브컬렉션 쓰기 없이 marker 만 부착.
  if (readHistory.length === 0) {
    const parentUpdate = {
      read_history: [],
      has_subcollection_history: true,
      user_count: 0,
      total_read_time: 0,
    };
    if (collection === 'time_event') {
      const eventMinute =
        typeof data.event_minute === 'number' ? data.event_minute : 0;
      // remain = max(0, event_minute - 0) = event_minute
      parentUpdate.remain_time = eventMinute < 0 ? 0 : eventMinute;
    }

    if (DRY_RUN) {
      console.log(
        `[${collection}/${docId}] (DRY-RUN) read_history 비어있음 → ` +
          `marker 만 부착 예정 (user_count=0, total_read_time=0` +
          (collection === 'time_event'
            ? `, remain_time=${parentUpdate.remain_time}`
            : '') +
          ')'
      );
    } else {
      await parentRef.update(parentUpdate);
      console.log(
        `[${collection}/${docId}] read_history 비어있음 → marker 부착 완료 ` +
          `(user_count=0, total_read_time=0` +
          (collection === 'time_event'
            ? `, remain_time=${parentUpdate.remain_time}`
            : '') +
          ')'
      );
    }
    return 'marker_only';
  }

  const { subDocs, totalReadTime, skippedNoUid } = summarizeReadHistory(
    collection,
    readHistory
  );

  if (DRY_RUN) {
    const previewLine =
      `[${collection}/${docId}] (DRY-RUN) 이전 예정. ` +
      `array_size=${readHistory.length}, ` +
      `planned_user_count=${subDocs.length}, ` +
      `planned_total_read_time=${totalReadTime}` +
      (skippedNoUid > 0 ? `, user_uid 누락 ${skippedNoUid}건 무시` : '');
    if (collection === 'time_event') {
      const eventMinute =
        typeof data.event_minute === 'number' ? data.event_minute : 0;
      const remain = eventMinute - totalReadTime;
      console.log(
        previewLine + `, planned_remain_time=${remain < 0 ? 0 : remain}`
      );
    } else {
      console.log(previewLine);
    }
    return 'migrated';
  }

  console.log(
    `[${collection}/${docId}] read_history 항목 ${readHistory.length}개 이전 시작.`
  );

  // 서브컬렉션 쓰기 (500개씩 batch).
  let batch = db.batch();
  let opsInBatch = 0;
  let writtenSubDocs = 0;

  for (const { userUid, body } of subDocs) {
    const subRef = parentRef.collection('read_history').doc(userUid);
    batch.set(subRef, body);
    opsInBatch += 1;
    writtenSubDocs += 1;

    if (opsInBatch >= BATCH_LIMIT) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      console.log(
        `[${collection}/${docId}] 서브컬렉션 batch 커밋 (${writtenSubDocs}/${subDocs.length})`
      );
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
    console.log(
      `[${collection}/${docId}] 서브컬렉션 batch 커밋 (${writtenSubDocs}/${subDocs.length}) - 마지막`
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
  return 'migrated';
}

async function migrateCollection(db, collection) {
  console.log(`\n=== ${collection} 컬렉션 이전 시작${DRY_RUN ? ' (DRY-RUN)' : ''} ===`);
  const snapshot = await db.collection(collection).get();
  console.log(`[${collection}] 전체 문서 수: ${snapshot.size}`);

  const counters = {
    migrated: 0,
    skipped_already: 0,
    marker_only: 0,
  };

  for (const docSnap of snapshot.docs) {
    // 문서별 순차 처리 - 메모리 / 경합 예측 가능.
    // eslint-disable-next-line no-await-in-loop
    const result = await migrateOne(db, collection, docSnap);
    if (counters[result] !== undefined) {
      counters[result] += 1;
    }
  }

  console.log(
    `--- ${collection} 요약: ` +
      `migrated=${counters.migrated}, ` +
      `skipped_already=${counters.skipped_already}, ` +
      `marker_only=${counters.marker_only} (전체 ${snapshot.size}) ---`
  );

  return counters;
}

async function main() {
  if (DRY_RUN) {
    console.log('** DRY-RUN 모드: 실제 Firestore 쓰기는 수행하지 않습니다. **');
  }

  const db = admin.firestore();
  const overall = {};

  for (const collection of COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    overall[collection] = await migrateCollection(db, collection);
  }

  console.log('\n=== Phase B 전체 요약 ===');
  for (const collection of COLLECTIONS) {
    const c = overall[collection];
    console.log(
      `${collection}: migrated=${c.migrated}, skipped_already=${c.skipped_already}, marker_only=${c.marker_only}`
    );
  }
  console.log(`Phase B 이전 ${DRY_RUN ? '시뮬레이션' : ''} 완료.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
