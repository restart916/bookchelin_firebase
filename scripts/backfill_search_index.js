/**
 * search_index/books 문서를 books 컬렉션으로부터 일회성 백필.
 *
 * Android 앱이 앱 시작 시 books 전체를 받지 않고 검색용 최소 필드만 받도록
 * 만든 search_index/books 인덱스 문서를 초기화하는 스크립트입니다.
 * 평소에는 update_search_index_on_book_write Cloud Function 트리거가
 * 자동으로 동기화하므로, 이 스크립트는 최초 1회(혹은 인덱스가 손상된
 * 경우 복구용)만 실행하면 됩니다.
 *
 * 사용법 (택1):
 *   1) 서비스 계정 키 파일을 ./serviceAccountKey.json 으로 두고:
 *        node scripts/backfill_search_index.js
 *   2) GOOGLE_APPLICATION_CREDENTIALS 환경 변수로 키 경로 지정:
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *          node scripts/backfill_search_index.js
 *
 * 주의: 서비스 계정 키 파일은 절대 커밋하지 마세요.
 * (.gitignore 의 `*-adminsdk-*.json` 패턴 및 serviceAccountKey.json 제외 권장)
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
  // Application Default Credentials 사용 (env var 가 가리키는 키 파일).
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

async function main() {
  const db = admin.firestore();

  console.log('books 컬렉션 로드 중 (hidden != true)...');
  // hidden 필드가 아예 없는 문서도 포함하기 위해 전체를 가져온 뒤
  // 클라이언트 사이드에서 hidden !== true 로 필터링합니다.
  // (Firestore where('hidden', '==', false) 는 hidden 필드가 없는
  // 문서를 누락시킬 수 있음.)
  const snap = await db.collection('books').get();

  const books = [];
  let hiddenCount = 0;
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.hidden === true) {
      hiddenCount += 1;
      return;
    }
    books.push({
      id: doc.id,
      title: typeof d.title === 'string' ? d.title : '',
      description: typeof d.description === 'string' ? d.description : '',
    });
  });

  console.log(
    `전체 ${snap.size}권 중 hidden ${hiddenCount}권 제외, ${books.length}권을 ` +
      'search_index/books 에 기록합니다.'
  );

  await db.doc('search_index/books').set({
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    books: books,
  });

  console.log('완료.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
