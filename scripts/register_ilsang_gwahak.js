/**
 * "일상의 과학" EPUB 북슐랭 등록 스크립트
 * - Storage: epub/북슐랭_일상의과학.epub + cover/북슐랭_일상의과학.png
 * - Firestore: books/ 신규 문서 (hidden: true)
 * - 기준: 잠들기 전 우주 (category:1, order:99991) 바로 다음
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
  storageBucket: 'bookchelin.appspot.com',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const EPUB_LOCAL  = '/Users/yongsanglee/Code/bookchelin_books/ilsang-gwahak/일상의_과학.epub';
const COVER_LOCAL = '/tmp/북슐랭_일상의과학_cover.png';

const EPUB_DEST  = 'epub/북슐랭_일상의과학.epub';
const COVER_DEST = 'cover/북슐랭_일상의과학.png';

async function uploadWithToken(localPath, destPath, contentType) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}

async function main() {
  // 중복 체크
  const dup = await db.collection('books').where('title', '==', '일상의 과학').limit(1).get();
  if (!dup.empty) {
    console.error('이미 존재:', dup.docs[0].id);
    process.exit(1);
  }

  // 파일 존재 확인
  if (!fs.existsSync(EPUB_LOCAL)) {
    console.error('EPUB 없음:', EPUB_LOCAL);
    process.exit(1);
  }
  if (!fs.existsSync(COVER_LOCAL)) {
    console.error('커버 없음:', COVER_LOCAL, '— 먼저 make_ilsang_cover.py 를 실행하세요');
    process.exit(1);
  }

  console.log('1) EPUB 업로드:', EPUB_DEST);
  // EPUB은 토큰 불필요 (클라이언트가 firestore_url 경로로 직접 접근)
  await bucket.upload(EPUB_LOCAL, {
    destination: EPUB_DEST,
    metadata: { contentType: 'application/epub+zip' },
  });
  console.log('   완료');

  console.log('2) 커버 업로드:', COVER_DEST);
  const imageUrl = await uploadWithToken(COVER_LOCAL, COVER_DEST, 'image/png');
  console.log('   image_url:', imageUrl);

  console.log('3) Firestore 문서 생성');
  const doc = {
    title: '일상의 과학',
    description: '매일 마주치지만 무심코 지나치는 현상 뒤에 숨은 화학과 물리를 풀어주는 교양 시리즈. 물·비누·불·커피·냉장고·빛·소리·자석·발효·체온까지, 일상 속 열 가지 과학 이야기.',
    toc: '1화 물은 왜 특별한가\n2화 비누는 어떻게 때를 씻어내는가\n3화 불꽃은 왜 타오르는가\n4화 커피가 우리를 깨우는 이유\n5화 냉장고는 어떻게 차가움을 만드는가\n6화 빛이 보인다는 것\n7화 소리의 여행\n8화 자석이 끌어당기는 힘\n9화 발효와 미생물의 세계\n10화 몸을 데우고 식히는 일',
    image_url: imageUrl,
    firestore_url: EPUB_DEST,
    category: '1',
    publisher: '',
    order: '99992',
    hidden: true,
    shop_yes24_link: '',
    shop_bandi_link: '',
    shop_inter_link: '',
  };

  const ref = await db.collection('books').add(doc);
  console.log('\n=== 등록 완료 ===');
  console.log('문서 ID:', ref.id);
  console.log('URL: https://bookchelin.web.app/book/' + ref.id);
  console.log('EPUB:', EPUB_DEST);
  console.log('cover:', COVER_DEST);
  console.log('category: 1 (자기계발/교양 — "잠들기 전 우주" 동일)');
  console.log('order: 99992');
  console.log('hidden: true ✓');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
