// 공유마당/위키문헌 만료저작물 책 업로드 (2026-06)
// 사용법: node upload_gongu_books.js          → hidden: true 로 신규 등록
//         node upload_gongu_books.js --unhide → gongu_books.json 의 책들 hidden: false 전환
// 책 메타데이터는 gongu_books.json 단일 소스 (build_gongu_epubs.py 와 공유).
// 생성물(EPUB/표지)은 build_gongu_epubs.py 로 /tmp/gongu_books 에 먼저 만들어야 한다.
// 멱등: 같은 제목+작가의 문서가 이미 있으면 건너뛴다.

const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
  storageBucket: 'bookchelin.appspot.com',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const SRC_DIR = '/tmp/gongu_books';
const SOURCE_NOTE =
  '※ 저작권 보호기간이 만료된 퍼블릭 도메인 작품입니다. 위키문헌·공유마당(한국저작권위원회) 공개 원문을 바탕으로 북슐랭이 제작했습니다.';

const BOOKS = require('./gongu_books.json');

async function uploadWithToken(localPath, destPath, contentType) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=2592000', // 30일 CDN 캐시
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    destPath
  )}?alt=media&token=${token}`;
}

async function findExisting(book) {
  const snap = await db
    .collection('books')
    .where('title', '==', `${book.title} (${book.author})`)
    .get();
  return snap.empty ? null : snap.docs[0];
}

async function main() {
  if (process.argv.includes('--unhide')) {
    for (const book of BOOKS) {
      const doc = await findExisting(book);
      if (!doc) {
        console.warn(`못 찾음: ${book.title}`);
        continue;
      }
      await doc.ref.update({ hidden: false });
      console.log(`공개 전환: ${book.title} (${doc.id})`);
    }
    return;
  }

  for (const book of BOOKS) {
    const displayTitle = `${book.title} (${book.author})`;
    const existing = await findExisting(book);
    if (existing) {
      console.log(`이미 존재, 건너뜀: ${displayTitle} (${existing.id})`);
      continue;
    }

    const epubDest = `epub/한국단편_${book.file}.epub`;
    await bucket.upload(`${SRC_DIR}/epub_${book.file}.epub`, {
      destination: epubDest,
      metadata: { contentType: 'application/epub+zip', cacheControl: 'public, max-age=2592000' },
    });
    const imageUrl = await uploadWithToken(
      `${SRC_DIR}/cover_${book.file}.png`,
      `cover/한국단편_${book.file}.png`,
      'image/png'
    );

    const doc = {
      title: displayTitle,
      description: `${book.desc}\n\n${SOURCE_NOTE}`,
      toc: `작품 소개\n${book.title}\n출처 및 저작권 안내`,
      image_url: imageUrl,
      firestore_url: epubDest,
      category: String(book.category), // 문자열 ('5' 문학, '4' 키즈)
      publisher: '',
      order: String(book.order), // 기존 데이터와 동일하게 문자열
      hidden: true,
      shop_yes24_link: '',
      shop_bandi_link: '',
      shop_inter_link: '',
    };
    const ref = await db.collection('books').add(doc);
    console.log(`등록 완료(hidden): ${displayTitle} → ${ref.id}`);
    console.log(`  epub: ${epubDest}`);
    console.log(`  cover: ${imageUrl}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
