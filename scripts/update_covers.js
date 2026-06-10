// 신규 12권(가장 최근 배치)의 표지만 재생성본으로 교체한다.
// build_gongu_epubs.py 로 /tmp/gongu_books/cover_*.png 를 먼저 다시 만들어야 한다.
// 사용법: node update_covers.js
// 기존 5권(JSON 앞 5개)은 건드리지 않는다. 이미 만족스러운 라이브 표지 유지.

const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
  storageBucket: 'bookchelin.appspot.com',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const SRC_DIR = '/tmp/gongu_books';
const ALL = require('./gongu_books.json');
const TARGETS = ALL.slice(5); // 신규 12권만 (앞 5권 = 기존 라이브, 유지)

async function uploadWithToken(localPath, destPath) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    destPath
  )}?alt=media&token=${token}`;
}

async function main() {
  for (const book of TARGETS) {
    const displayTitle = `${book.title} (${book.author})`;
    const snap = await db.collection('books').where('title', '==', displayTitle).get();
    if (snap.empty) {
      console.warn(`못 찾음: ${displayTitle}`);
      continue;
    }
    const imageUrl = await uploadWithToken(
      `${SRC_DIR}/cover_${book.file}.png`,
      `cover/한국단편_${book.file}.png`
    );
    await snap.docs[0].ref.update({ image_url: imageUrl });
    console.log(`표지 교체: ${displayTitle} (${snap.docs[0].id})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
