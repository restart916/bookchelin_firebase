// upload_sokdam.js — 속담집 EPUB 단일 책 업로드 (2026-06).
// 속담·관용구는 전래(PD), 뜻풀이는 자체 작성 → 독점 콘텐츠.
// build_sokdam_epub.py 로 /tmp/sokdam 에 EPUB·표지를 먼저 만들어야 한다.
// 사용법: node upload_sokdam.js          → hidden:false 로 바로 공개 등록
//         node upload_sokdam.js --hidden → hidden:true 로 등록(검수용)
// 멱등: 같은 제목 문서가 있으면 건너뜀.

const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
  storageBucket: 'bookchelin.appspot.com',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const SRC = '/tmp/sokdam';
const FILE = 'sokdam';
const META = require('./sokdam.json');

const TITLE = META.title; // "곁에 두고 읽는 우리 속담"
const COUNT = META.groups.reduce((a, g) => a + g.items.length, 0);
const THEMES = META.groups.map((g) => g.theme).join(' · ');

const DESCRIPTION =
  `오래도록 입에서 입으로 전해 내려온 우리 속담과 관용구 ${COUNT}개를 주제별로 모았습니다. ` +
  `${THEMES} — 아홉 가지 주제로 나눠, 짧은 한마디에 담긴 조상의 지혜와 해학을 뜻풀이와 함께 가볍게 읽을 수 있습니다.\n\n` +
  `※ 속담·관용구는 오래도록 전해 내려온 우리말 유산이며, 뜻풀이는 북슐랭이 직접 정리해 담았습니다.`;

async function uploadWithToken(localPath, destPath, contentType) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    destPath
  )}?alt=media&token=${token}`;
}

async function main() {
  const hidden = process.argv.includes('--hidden');
  const existing = await db.collection('books').where('title', '==', TITLE).get();
  if (!existing.empty) {
    console.log(`이미 존재, 건너뜀: ${TITLE} (${existing.docs[0].id})`);
    return;
  }

  const epubLocal = `${SRC}/epub_${FILE}.epub`;
  const coverLocal = `${SRC}/cover_${FILE}.png`;
  if (!fs.existsSync(epubLocal) || !fs.existsSync(coverLocal)) {
    console.error(`파일 없음: ${epubLocal} / ${coverLocal} — build_sokdam_epub.py 먼저 실행`);
    process.exit(1);
  }

  const epubDest = `epub/속담_${FILE}.epub`;
  await bucket.upload(epubLocal, {
    destination: epubDest,
    metadata: { contentType: 'application/epub+zip' },
  });
  const imageUrl = await uploadWithToken(coverLocal, `cover/속담_${FILE}.png`, 'image/png');

  const doc = {
    title: TITLE,
    description: DESCRIPTION,
    toc: `여는 글\n${THEMES}\n출처 및 안내`,
    image_url: imageUrl,
    firestore_url: epubDest,
    category: '1', // 지식교양
    publisher: '',
    order: '99990', // 지식교양 최상단 노출
    hidden,
    shop_yes24_link: '',
    shop_bandi_link: '',
    shop_inter_link: '',
  };
  const ref = await db.collection('books').add(doc);
  console.log(`등록 완료(${hidden ? 'hidden' : '공개'}): ${TITLE} → ${ref.id}`);
  console.log(`  속담 ${COUNT}개 · epub: ${epubDest}`);
  console.log(`  cover: ${imageUrl}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
