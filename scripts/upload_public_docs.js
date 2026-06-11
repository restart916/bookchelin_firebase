// 공공데이터 PDF(운전면허 문제은행 등) 업로드 (2026-06)
// 사용법: node upload_public_docs.js          → hidden: true 로 신규 등록
//         node upload_public_docs.js --unhide → public_docs.json 의 책들 hidden: false 전환
// 메타데이터는 public_docs.json 단일 소스. PDF 원문은 /tmp/public_docs 에,
// 표지는 build_public_doc_covers.py 로 같은 위치에 먼저 만들어야 한다.
//
// 라이선스 원칙(docs/public-domain-books.md): 공공누리 제1유형 또는
// 공공데이터포털 "이용허락범위 제한 없음" 이 확인된 자료만 등록한다.
// 원문은 무수정 그대로 올리고(출처 기관의 이용 조건), 표지만 자체 제작.

const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(require('./bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')),
  storageBucket: 'bookchelin.appspot.com',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const SRC_DIR = '/tmp/public_docs';

const DOCS = require('./public_docs.json');

function sourceNote(doc) {
  return `※ ${doc.publisher}이(가) 공개한 공공저작물(${doc.edition})을 원문 그대로 제공합니다. 출처: ${doc.publisher} (${doc.source_url})`;
}

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

async function findExisting(doc) {
  const snap = await db.collection('books').where('title', '==', doc.title).get();
  return snap.empty ? null : snap.docs[0];
}

async function main() {
  if (process.argv.includes('--unhide')) {
    for (const item of DOCS) {
      const doc = await findExisting(item);
      if (!doc) {
        console.warn(`못 찾음: ${item.title}`);
        continue;
      }
      await doc.ref.update({ hidden: false });
      console.log(`공개 전환: ${item.title} (${doc.id})`);
    }
    return;
  }

  for (const item of DOCS) {
    const existing = await findExisting(item);
    if (existing) {
      console.log(`이미 존재, 건너뜀: ${item.title} (${existing.id})`);
      continue;
    }

    const pdfLocal = `${SRC_DIR}/${item.pdf}`;
    const coverLocal = `${SRC_DIR}/cover_${item.file}.png`;
    if (!fs.existsSync(pdfLocal) || !fs.existsSync(coverLocal)) {
      console.error(`파일 없음, 건너뜀: ${item.title} (${pdfLocal} / ${coverLocal})`);
      continue;
    }

    const pdfDest = `pdf/공공_${item.file}.pdf`;
    await bucket.upload(pdfLocal, {
      destination: pdfDest,
      metadata: { contentType: 'application/pdf' },
    });
    const imageUrl = await uploadWithToken(coverLocal, `cover/공공_${item.file}.png`, 'image/png');

    const doc = {
      title: item.title,
      description: `${item.desc}\n\n${sourceNote(item)}`,
      toc: `자료 안내\n${item.title}\n출처 및 이용 조건 안내`,
      image_url: imageUrl,
      firestore_url: pdfDest,
      category: String(item.category),
      publisher: item.publisher,
      order: String(item.order),
      hidden: true,
      shop_yes24_link: '',
      shop_bandi_link: '',
      shop_inter_link: '',
    };
    const ref = await db.collection('books').add(doc);
    console.log(`등록 완료(hidden): ${item.title} → ${ref.id}`);
    console.log(`  pdf: ${pdfDest}`);
    console.log(`  cover: ${imageUrl}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
