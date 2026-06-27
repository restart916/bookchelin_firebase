// analyze_genre_preferences.mjs
//
// 최근 N일(기본 30일) 독서 기록(read_time_logs)을 책 장르(books.category →
// book_category.name)와 조인해, 어떤 장르가 실제로 많이 읽히는지 집계한다.
// 프로덕션 Firestore 규칙이 공개 읽기이므로 서비스 계정 키 없이 REST 로 동작한다.
//
// 실행:
//   node scripts/analyze_genre_preferences.mjs            # 최근 30일
//   node scripts/analyze_genre_preferences.mjs 60         # 최근 60일
//
// 산출물:
//   - 콘솔에 장르별 랭킹 표
//   - scripts/data/genre-preferences-<날짜>.json (원시 집계)
//   - scripts/data/genre-preferences-<날짜>.md   (정리된 리포트)

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT = 'bookchelin';
const HOST = 'firestore.googleapis.com';
const BASE = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DAYS = Number(process.argv[2] || 30);
const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString();

// ---- 작은 REST 헬퍼 ----------------------------------------------------------
function post(path, body) {
  return request('POST', path, body);
}
function get(path) {
  return request('GET', path, null);
}
function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const opts = { host: HOST, path, method, headers: { 'Content-Type': 'application/json' } };
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);
    import('node:https').then(({ default: https }) => {
      const req = https.request(opts, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
          resolve(JSON.parse(d || '{}'));
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// Firestore 값 → JS 값
function val(v) {
  if (v == null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  return undefined;
}
function fields(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = val(v);
  out.__id = doc.name.split('/').pop();
  return out;
}

// 컬렉션 전체 페이지네이션(GET listDocuments)
async function listAll(collection) {
  const out = [];
  let pageToken = '';
  do {
    const q = `?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await get(`${BASE}/${collection}${q}`);
    for (const doc of data.documents || []) out.push(fields(doc));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

// read_time_logs: createdAt(문자열) >= cutoff 를 createdAt,__name__ 정렬로 커서 페이지네이션
async function fetchLogs() {
  const logs = [];
  let cursor = null;
  for (;;) {
    const sq = {
      from: [{ collectionId: 'read_time_logs' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'createdAt' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { stringValue: cutoff },
        },
      },
      orderBy: [
        { field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
      limit: 2000,
    };
    if (cursor) sq.startAt = { values: cursor, before: false };
    const rows = await post(`${BASE}:runQuery`, { structuredQuery: sq });
    const docs = rows.filter((r) => r.document).map((r) => r.document);
    if (docs.length === 0) break;
    for (const doc of docs) logs.push(fields(doc));
    const last = docs[docs.length - 1];
    cursor = [
      { stringValue: fields(last).createdAt },
      { referenceValue: last.name },
    ];
    if (docs.length < 2000) break;
    process.stderr.write(`  ...${logs.length} logs\n`);
  }
  return logs;
}

// ---- 메인 -------------------------------------------------------------------
console.error(`최근 ${DAYS}일 (cutoff ${cutoff}) 데이터 수집 중...`);
const [cats, books, logs] = await Promise.all([
  listAll('book_category'),
  listAll('books'),
  fetchLogs(),
]);

const catName = new Map(cats.map((c) => [String(c.id), c.name]));
const bookById = new Map(books.map((b) => [b.__id, b]));
console.error(`장르 ${cats.length}개, 책 ${books.length}권, 로그 ${logs.length}건`);

// 집계
const UNKNOWN = '(미분류/삭제된 책)';
const byCat = new Map(); // catName -> {seconds, sessions, readers:Set, books:Set}
const byBook = new Map(); // bookId -> {seconds, sessions, readers:Set}
let totalSeconds = 0;
const allReaders = new Set();

for (const log of logs) {
  const sec = Number(log.read_time) || 0;
  totalSeconds += sec;
  if (log.user_uid) allReaders.add(log.user_uid);

  const book = bookById.get(log.book_id);
  const cName = book ? catName.get(String(book.category)) || `(코드 ${book.category})` : UNKNOWN;

  if (!byCat.has(cName)) byCat.set(cName, { seconds: 0, sessions: 0, readers: new Set(), books: new Set() });
  const c = byCat.get(cName);
  c.seconds += sec;
  c.sessions += 1;
  if (log.user_uid) c.readers.add(log.user_uid);
  if (log.book_id) c.books.add(log.book_id);

  if (!byBook.has(log.book_id)) byBook.set(log.book_id, { seconds: 0, sessions: 0, readers: new Set() });
  const bb = byBook.get(log.book_id);
  bb.seconds += sec;
  bb.sessions += 1;
  if (log.user_uid) bb.readers.add(log.user_uid);
}

const fmtH = (s) => (s / 3600).toFixed(1);
const pct = (s) => (totalSeconds ? ((s / totalSeconds) * 100).toFixed(1) : '0.0');

const catRanking = [...byCat.entries()]
  .map(([name, v]) => ({
    genre: name,
    hours: Number(fmtH(v.seconds)),
    share_pct: Number(pct(v.seconds)),
    sessions: v.sessions,
    readers: v.readers.size,
    books_read: v.books.size,
    sec_per_reader: v.readers.size ? Math.round(v.seconds / v.readers.size) : 0,
  }))
  .sort((a, b) => b.hours - a.hours);

const topBooks = [...byBook.entries()]
  .map(([id, v]) => ({
    title: bookById.get(id)?.title || '(삭제/알수없음)',
    genre: bookById.get(id) ? catName.get(String(bookById.get(id).category)) || `(코드 ${bookById.get(id).category})` : UNKNOWN,
    hours: Number(fmtH(v.seconds)),
    readers: v.readers.size,
    sessions: v.sessions,
  }))
  .sort((a, b) => b.hours - a.hours)
  .slice(0, 25);

// 콘솔 표
console.log(`\n=== 최근 ${DAYS}일 장르별 독서량 (총 ${fmtH(totalSeconds)}h, 고유 독자 ${allReaders.size}명, ${logs.length} 세션) ===`);
console.log('순위 장르                  시간(h)  비중%   독자수  책수  세션  독자당(분)');
catRanking.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)}  ${r.genre.padEnd(18)} ${String(r.hours).padStart(7)} ${String(r.share_pct).padStart(6)}  ${String(r.readers).padStart(6)} ${String(r.books_read).padStart(5)} ${String(r.sessions).padStart(5)}  ${String(Math.round(r.sec_per_reader / 60)).padStart(7)}`
  );
});

console.log(`\n=== 가장 많이 읽힌 책 TOP 25 ===`);
topBooks.forEach((b, i) => {
  console.log(`${String(i + 1).padStart(2)}  [${b.genre}] ${b.title} — ${b.hours}h, 독자 ${b.readers}, 세션 ${b.sessions}`);
});

// 저장
const stamp = new Date().toISOString().slice(0, 10);
const outDir = join(__dirname, 'data');
mkdirSync(outDir, { recursive: true });
const result = {
  generated_at: new Date().toISOString(),
  window_days: DAYS,
  cutoff,
  totals: { hours: Number(fmtH(totalSeconds)), sessions: logs.length, unique_readers: allReaders.size },
  genre_ranking: catRanking,
  top_books: topBooks,
};
writeFileSync(join(outDir, `genre-preferences-${stamp}.json`), JSON.stringify(result, null, 2));
console.error(`\n저장: scripts/data/genre-preferences-${stamp}.json`);
export {};
