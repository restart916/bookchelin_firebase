/**
 * Firestore books 컬렉션의 image_url을 HTTP로 검증합니다.
 * 사용: node scripts/verify-book-images.mjs
 */

import https from 'https';
import http from 'http';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'output');

const FIRESTORE_HOST = 'firestore.googleapis.com';
const CONCURRENCY = 12;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 8;
const USER_AGENT = 'BookchelinImageCheck/1.0';

function httpsGetJson(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: FIRESTORE_HOST,
        path,
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Firestore request timeout'));
    });
    req.end();
  });
}

function docIdFromName(name) {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

async function fetchAllBooks() {
  const books = [];
  let pageToken = '';
  const mask = '&mask.fieldPaths=image_url&mask.fieldPaths=title';
  for (;;) {
    let path =
      '/v1/projects/bookchelin/databases/(default)/documents/books?pageSize=300' +
      mask;
    if (pageToken) {
      path += '&pageToken=' + encodeURIComponent(pageToken);
    }
    const j = await httpsGetJson(path);
    const docs = j.documents || [];
    for (const d of docs) {
      const id = docIdFromName(d.name);
      const f = d.fields || {};
      const title = f.title?.stringValue ?? '';
      const image_url = f.image_url?.stringValue ?? '';
      books.push({ id, title, image_url });
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return books;
}

function isImageContentType(ct) {
  if (!ct) return false;
  const lower = String(ct).toLowerCase();
  return (
    lower.startsWith('image/') ||
    lower.includes('application/octet-stream')
  );
}

function looksLikeImageBytes(buf) {
  if (!buf || buf.length < 3) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  const isWebp =
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50;
  return isJpeg || isPng || isGif || isWebp;
}

/**
 * Range GET (또는 HEAD 시도 후 GET) — 리다이렉트 추적
 * @returns {Promise<{ ok: boolean, status?: number, reason: string, contentType?: string }>}
 */
function httpRequest(urlString, method, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      resolve({ ok: false, reason: '리다이렉트 과다' });
      return;
    }
    let u;
    try {
      u = new URL(urlString);
    } catch {
      resolve({ ok: false, reason: 'URL 형식 오류' });
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'image/*,*/*;q=0.8',
    };
    if (method === 'GET') {
      headers.Range = 'bytes=0-4095';
    }

    const req = lib.request(
      u,
      {
        method,
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          const next = new URL(res.headers.location, u).href;
          res.resume();
          httpRequest(next, method, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';

          if (code >= 200 && code < 300) {
            if (method === 'HEAD') {
              if (isImageContentType(ct)) {
                resolve({
                  ok: true,
                  status: code,
                  reason: 'OK',
                  contentType: ct,
                });
                return;
              }
              resolve({ ok: false, status: code, reason: `HEAD 비이미지: ${ct}`, contentType: ct });
              return;
            }
            if (isImageContentType(ct) || looksLikeImageBytes(body)) {
              resolve({
                ok: true,
                status: code,
                reason: 'OK',
                contentType: ct,
              });
              return;
            }
            const textStart = body
              .toString('utf8', 0, Math.min(80, body.length))
              .trimStart();
            if (textStart.startsWith('<') || String(ct).toLowerCase().includes('text/html')) {
              resolve({
                ok: false,
                status: code,
                reason: 'HTML/오류 페이지',
                contentType: ct,
              });
              return;
            }
            resolve({
              ok: false,
              status: code,
              reason: `이미지 아님 (${ct || 'type 없음'})`,
              contentType: ct,
            });
            return;
          }

          resolve({
            ok: false,
            status: code,
            reason: `HTTP ${code}`,
            contentType: ct,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: '타임아웃' });
    });
    req.on('error', (e) => {
      resolve({ ok: false, reason: `네트워크: ${e.message}` });
    });
    req.end();
  });
}

async function verifyImageUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'image_url 비어있음' };
  }

  let head = await httpRequest(trimmed, 'HEAD');
  if (head.ok) return head;

  const getR = await httpRequest(trimmed, 'GET');
  return getR;
}

async function pool(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return ret;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.error('Firestore에서 책 목록 로드 중...');
  const books = await fetchAllBooks();
  console.error(
    `총 ${books.length}권. 이미지 URL 검증 중 (동시 ${CONCURRENCY}개)...`
  );

  let done = 0;
  const results = await pool(books, CONCURRENCY, async (book) => {
    const v = await verifyImageUrl(book.image_url);
    done++;
    if (done % 50 === 0 || done === books.length) {
      console.error(`  진행 ${done}/${books.length}`);
    }
    return { ...book, ...v };
  });

  const okList = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);

  const summary = {
    generatedAt: new Date().toISOString(),
    totalBooks: books.length,
    imageOk: okList.length,
    imageBad: bad.length,
  };

  console.log('\n=== 요약 ===');
  console.log(JSON.stringify(summary, null, 2));

  writeFileSync(
    join(OUT_DIR, 'book-images-expired.json'),
    JSON.stringify(
      {
        summary,
        expired: bad.map((b) => ({
          id: b.id,
          title: b.title,
          image_url: b.image_url,
          reason: b.reason,
          status: b.status,
        })),
      },
      null,
      2
    ),
    'utf8'
  );
  writeFileSync(
    join(OUT_DIR, 'book-images-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  writeFileSync(
    join(OUT_DIR, 'book-images-expired.csv'),
    [
      'id,title,image_url,reason',
      ...bad.map((b) =>
        [
          b.id,
          `"${String(b.title).replace(/"/g, '""')}"`,
          `"${String(b.image_url).replace(/"/g, '""')}"`,
          `"${String(b.reason).replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n'),
    'utf8'
  );

  console.error(`\n저장: scripts/output/book-images-expired.json, .csv`);
  console.log('\n만료/비정상 이미지 (JSON 한 줄씩):');
  for (const b of bad) {
    console.log(
      JSON.stringify({
        id: b.id,
        title: b.title,
        image_url: b.image_url,
        reason: b.reason,
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
