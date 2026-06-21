// 자체 제작 교양서 "잠들기 전 우주"(10화 EPUB) 등록 (2026-06)
//
// 북슐랭 프로덕션 Firestore/Storage 규칙이 공개 읽기/쓰기이므로 서비스 계정 키 없이
// REST 로 동작한다(다른 .mjs 운영 스크립트와 동일 방식). admin 키가 있는 로컬이라면
// upload_gongu_books.js 패턴(firebase-admin)으로 바꿔도 결과는 같다.
//
// 사용법:
//   node scripts/upload_uju.mjs            # hidden:true 로 신규 등록 (멱등: 같은 제목 있으면 skip)
//   node scripts/upload_uju.mjs --unhide   # 검수 후 공개 전환
//
// 자산: scripts/data/jamdeulgijeonuju.epub (10화 통파일),
//       scripts/data/jamdeulgijeonuju-cover.png (표지, build_uju_cover.py 로 생성)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = 'bookchelin';
const BUCKET = 'bookchelin.appspot.com';
const FS_HOST = 'firestore.googleapis.com';
const ST_HOST = 'firebasestorage.googleapis.com';
const FS_BASE = `/v1/projects/${PROJECT}/databases/(default)/documents`;

const TITLE = '잠들기 전 우주';
const EPUB_PATH = 'epub/북슐랭_잠들기전우주.epub';
const COVER_PATH = 'cover/북슐랭_잠들기전우주.png';

const DESCRIPTION =
  '별의 일생에서 우주의 끝까지, 잠들기 전에 읽는 열 편의 우주 이야기. ' +
  '사전지식 없이 읽는 입문 천문 교양으로, 차분한 밤 이야기 톤으로 별·은하·블랙홀·행성·' +
  '빅뱅·보이지 않는 우주·우주의 끝까지 한 편 약 10분 분량, 모두 10화로 담았습니다.\n\n' +
  '※ 일반 천문 상식을 바탕으로 북슐랭이 자체 제작한 교양 콘텐츠입니다.';

const TOC = [
  '1화 별의 일생',
  '2화 은하라는 도시',
  '3화 블랙홀의 안과 밖',
  '4화 행성은 어떻게 생기는가',
  '5화 태양계 산책',
  '6화 달과 조수',
  '7화 빛은 시간을 거슬러 온다',
  '8화 빅뱅, 모든 것의 시작',
  '9화 보이지 않는 우주',
  '10화 우주의 끝',
].join('\n');

// ---- REST 헬퍼 --------------------------------------------------------------
function req(host, path, method, headers, bodyBuf) {
  return new Promise((resolve, reject) => {
    const opts = { host, path, method, headers: { ...headers } };
    if (bodyBuf) opts.headers['Content-Length'] = bodyBuf.length;
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}
const fsJson = (method, path, obj) =>
  req(FS_HOST, path, method, { 'Content-Type': 'application/json' }, obj ? Buffer.from(JSON.stringify(obj)) : null);

async function findExisting(title) {
  const q = {
    structuredQuery: {
      from: [{ collectionId: 'books' }],
      where: { fieldFilter: { field: { fieldPath: 'title' }, op: 'EQUAL', value: { stringValue: title } } },
      limit: 1,
    },
  };
  const r = await fsJson('POST', `${FS_BASE}:runQuery`, q);
  const rows = JSON.parse(r.body);
  const hit = rows.find((x) => x.document);
  return hit ? hit.document : null;
}

async function uploadStorage(localFile, destPath, contentType, withToken) {
  const buf = readFileSync(localFile);
  // v0 업로드 endpoint 가 자동으로 다운로드 토큰을 생성해 응답(downloadTokens)에 돌려준다.
  const r = await req(
    ST_HOST,
    `/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(destPath)}`,
    'POST',
    { 'Content-Type': contentType },
    buf
  );
  if (r.status >= 300) throw new Error(`Storage upload 실패 ${destPath}: ${r.status} ${r.body.slice(0, 200)}`);
  if (!withToken) return destPath; // epub: firestore_url 에 경로만 저장 (앱이 SDK로 읽음)
  const token = (JSON.parse(r.body).downloadTokens || '').split(',')[0];
  if (!token) throw new Error(`다운로드 토큰 없음: ${destPath}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}

async function main() {
  const unhide = process.argv.includes('--unhide');
  const existing = await findExisting(TITLE);

  if (unhide) {
    if (!existing) return console.error(`못 찾음: ${TITLE}`);
    const rel = existing.name.split('/documents/')[1].split('/').map(encodeURIComponent).join('/');
    const r = await fsJson('PATCH', `${FS_BASE.replace('/documents','')}/documents/${rel}?updateMask.fieldPaths=hidden`, {
      fields: { hidden: { booleanValue: false } },
    });
    console.log(`공개 전환 ${r.status}: ${TITLE} (${existing.name.split('/').pop()})`);
    return;
  }

  if (existing) {
    console.log(`이미 존재, 건너뜀: ${TITLE} (${existing.name.split('/').pop()})`);
    return;
  }

  console.log('EPUB 업로드...');
  await uploadStorage(join(__dirname, 'data/jamdeulgijeonuju.epub'), EPUB_PATH, 'application/epub+zip', false);
  console.log('표지 업로드...');
  const imageUrl = await uploadStorage(join(__dirname, 'data/jamdeulgijeonuju-cover.png'), COVER_PATH, 'image/png', true);

  const fields = {
    title: { stringValue: TITLE },
    description: { stringValue: DESCRIPTION },
    toc: { stringValue: TOC },
    image_url: { stringValue: imageUrl },
    firestore_url: { stringValue: EPUB_PATH },
    category: { stringValue: '1' }, // 지식교양
    publisher: { stringValue: '' }, // 자체 콘텐츠 → 출판사 정산 제외
    order: { stringValue: '9990' },
    hidden: { booleanValue: true },
    shop_yes24_link: { stringValue: '' },
    shop_bandi_link: { stringValue: '' },
    shop_inter_link: { stringValue: '' },
  };
  const r = await fsJson('POST', `${FS_BASE}/books`, { fields });
  if (r.status >= 300) throw new Error(`books 문서 생성 실패: ${r.status} ${r.body.slice(0, 300)}`);
  const id = JSON.parse(r.body).name.split('/').pop();
  console.log(`등록 완료(hidden): ${TITLE} → ${id}`);
  console.log(`  epub:  ${EPUB_PATH}`);
  console.log(`  cover: ${imageUrl}`);
  console.log(`검수 후 공개: node scripts/upload_uju.mjs --unhide`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
