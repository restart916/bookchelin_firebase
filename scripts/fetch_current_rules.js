/**
 * 현재 production에 배포된 Firestore / Storage 보안 규칙을 다운로드.
 *
 * 결과:
 *   - firestore.rules (프로젝트 루트)
 *   - storage.rules    (프로젝트 루트, Storage 사용 시)
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=./bookchelin-firebase-adminsdk-*.json \
 *     node fetch_current_rules.js
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
} else {
  const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(KEY_PATH)) {
    // eslint-disable-next-line global-require
    admin.initializeApp({
      credential: admin.credential.cert(require(KEY_PATH)),
    });
  } else {
    console.error('서비스 계정 키를 찾을 수 없습니다.');
    process.exit(1);
  }
}

const ROOT = path.resolve(__dirname, '..');

async function dumpFirestore() {
  try {
    const ruleset = await admin.securityRules().getFirestoreRuleset();
    const file = ruleset.source.find((f) => f.name.endsWith('.rules')) || ruleset.source[0];
    const out = path.join(ROOT, 'firestore.rules');
    fs.writeFileSync(out, file.content, 'utf8');
    console.log(`firestore: ${out} (${file.content.length} bytes)`);
  } catch (e) {
    console.error('firestore rules fetch 실패:', e.message);
  }
}

async function dumpStorage() {
  // 프로젝트 ID로부터 기본 버킷 이름 추정. 환경변수로 override 가능.
  const projectId = admin.app().options.projectId || admin.instanceId().app.options.projectId;
  const candidates = [
    process.env.STORAGE_BUCKET,
    projectId && `${projectId}.appspot.com`,
    projectId && `${projectId}.firebasestorage.app`,
  ].filter(Boolean);

  for (const bucket of candidates) {
    try {
      const ruleset = await admin.securityRules().getStorageRuleset(bucket);
      const file = ruleset.source.find((f) => f.name.endsWith('.rules')) || ruleset.source[0];
      const out = path.join(ROOT, 'storage.rules');
      fs.writeFileSync(out, file.content, 'utf8');
      console.log(`storage [${bucket}]: ${out} (${file.content.length} bytes)`);
      return;
    } catch (e) {
      console.warn(`storage [${bucket}] 시도 실패:`, e.message);
    }
  }
  console.error('storage rules fetch 실패. STORAGE_BUCKET 환경변수로 버킷 지정 필요할 수 있음.');
}

(async () => {
  await dumpFirestore();
  await dumpStorage();
  process.exit(0);
})();
