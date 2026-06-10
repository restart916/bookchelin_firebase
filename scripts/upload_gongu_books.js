// 공유마당/위키문헌 만료저작물 단편소설 5권 업로드 (2026-06)
// 사용법: node upload_gongu_books.js          → hidden: true 로 신규 등록
//         node upload_gongu_books.js --unhide → 등록된 5권 hidden: false 전환
// 생성물은 build_gongu_epubs.py 로 /tmp/gongu_books 에 먼저 만들어야 한다.
// EPUB/표지를 Storage 에 올리고 books 문서를 만든다.
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

const BOOKS = [
  {
    file: '운수_좋은_날',
    title: '운수 좋은 날',
    author: '현진건',
    order: 505,
    description:
      '인력거꾼 김 첨지의 하루를 통해 일제강점기 도시 하층민의 비극을 그린 현진건의 대표 단편. 모처럼 손님이 끊이지 않는 "운수 좋은" 날, 아픈 아내를 위해 설렁탕을 사 들고 돌아온 그를 기다리는 것은…. (1924년 《개벽》 발표)',
  },
  {
    file: '메밀꽃_필_무렵',
    title: '메밀꽃 필 무렵',
    author: '이효석',
    order: 504,
    description:
      '달빛 아래 소금을 뿌린 듯 흐드러진 메밀꽃밭을 배경으로, 장돌뱅이 허 생원의 평생 잊지 못할 하룻밤 인연을 그린 한국 서정 단편의 백미. (1936년 《조광》 발표)',
  },
  {
    file: '동백꽃',
    title: '동백꽃',
    author: '김유정',
    order: 503,
    description:
      "닭싸움을 빌미로 시비를 걸어오는 점순이와 눈치 없는 '나'의 풋풋한 사랑을 해학적으로 그린 김유정의 대표작. 알싸한 노란 동백꽃(생강나무 꽃) 향기 속에 묻히는 결말이 백미. (1936년 《조광》 발표)",
  },
  {
    file: '날개',
    title: '날개',
    author: '이상',
    order: 502,
    description:
      '"박제가 되어 버린 천재를 아시오?" — 식민지 지식인의 무력한 자의식을 실험적 문체로 그려낸 한국 모더니즘 문학의 정점. (1936년 《조광》 발표)',
  },
  {
    file: '감자',
    title: '감자',
    author: '김동인',
    order: 501,
    description:
      '가난 때문에 칠성문 밖 빈민굴로 흘러든 복녀가 도덕적으로 몰락해 가는 과정을 차갑게 응시한 김동인의 자연주의 대표 단편. (1925년 《조선문단》 발표)',
  },
];

async function uploadWithToken(localPath, destPath, contentType) {
  const token = crypto.randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: {
      contentType,
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
      metadata: { contentType: 'application/epub+zip' },
    });
    const imageUrl = await uploadWithToken(
      `${SRC_DIR}/cover_${book.file}.png`,
      `cover/한국단편_${book.file}.png`,
      'image/png'
    );

    const doc = {
      title: displayTitle,
      description: `${book.description}\n\n${SOURCE_NOTE}`,
      toc: `작품 소개\n${book.title}\n출처 및 저작권 안내`,
      image_url: imageUrl,
      firestore_url: epubDest,
      category: '5',
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
