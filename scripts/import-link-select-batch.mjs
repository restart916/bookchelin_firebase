/**
 * link-select-bestseller-candidates.json → Firestore link_select 일괄 생성
 * node scripts/import-link-select-batch.mjs
 */

import https from 'https';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, 'data', 'link-select-bestseller-candidates.json');
const HOST = 'firestore.googleapis.com';
const BASE = '/v1/projects/bookchelin/databases/(default)/documents/link_select';

function firestoreFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else if (typeof v === 'number' && Number.isInteger(v))
      out[k] = { integerValue: String(v) };
    else out[k] = { stringValue: String(v) };
  }
  return out;
}

function createDocument(body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path: BASE,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
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
    req.write(payload);
    req.end();
  });
}

async function main() {
  const raw = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const items = raw.items || [];
  const tsBase = Math.floor(Date.now() / 1000);
  const created = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const fields = firestoreFields({
      title: it.title,
      image_url: it.image_url,
      link_url: it.link_url,
      description: it.description || '',
      timestamp: tsBase + i,
      hidden: false,
      category: '5',
    });
    try {
      const doc = await createDocument({ fields });
      const id = doc.name.split('/').pop();
      created.push({ id, title: it.title });
      console.error(`  [${i + 1}/${items.length}] OK ${id} ${it.title}`);
    } catch (e) {
      errors.push({ title: it.title, error: e.message });
      console.error(`  [${i + 1}/${items.length}] FAIL ${it.title}: ${e.message}`);
    }
  }

  const outPath = join(__dirname, 'output', 'link-select-import-result.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        count: created.length,
        failed: errors.length,
        created,
        errors,
      },
      null,
      2
    ),
    'utf8'
  );
  console.error(`\n완료: 성공 ${created.length}, 실패 ${errors.length} → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
