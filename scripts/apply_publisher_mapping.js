'use strict';
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(
    path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json')
  ),
});
const db = admin.firestore();

// 신규 생성 출판사 (기존 최대 119 → 120~122)
const NEW_PUBLISHERS = [
  { code: 'rolling120',   name: '롤링다이스'    },
  { code: 'hca121',       name: '휴먼컬처아리랑' },
  { code: 'bookchelin122', name: '북슐랭'         },
];

const GEN_NAME_TO_CODE = {
  '롤링다이스':    'rolling120',
  '휴먼컬처아리랑': 'hca121',
  '북슐랭':       'bookchelin122',
};

// ── 최소 CSV 파서 (BOM 제거, 따옴표 이스케이프 처리) ──────────────────────────
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const vals = splitLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    rows.push(row);
  }
  return rows;
}

function splitLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function main() {
  // ① 신규 출판사 생성
  console.log('━━━ ① publisher 컬렉션 신규 생성 ━━━');
  for (const p of NEW_PUBLISHERS) {
    const ref  = db.collection('publisher').doc(p.code);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  SKIP (already exists): ${p.code} → ${p.name}`);
    } else {
      await ref.set({ code: p.code, name: p.name });
      console.log(`  ✅ CREATE: ${p.code} → ${p.name}`);
    }
  }

  // ② CSV 로드
  const csvPath = path.join(
    process.env.HOME,
    'Desktop/북슐랭_출판사적용/publisher_apply_candidates.csv'
  );
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));

  // ③ 업데이트 목록 구성
  const updates = [];
  const skipped = [];
  for (const row of rows) {
    const { bookId, 분류, 적용코드, 매핑출판사명 } = row;
    if (!bookId) continue;

    let code = '';
    if (분류 === '채움') {
      code = 적용코드;
    } else if (분류 === '생성필요') {
      code = GEN_NAME_TO_CODE[매핑출판사명] || '';
      if (!code) {
        console.warn(`  ⚠ 코드 미결: ${bookId} (${매핑출판사명})`);
        skipped.push(row);
        continue;
      }
    } else {
      skipped.push(row); // 유지
      continue;
    }

    if (!code) { skipped.push(row); continue; }
    updates.push({ bookId, code, pub: 매핑출판사명 });
  }

  console.log(`\n━━━ ② books.publisher 적용 대상 ━━━`);
  console.log(`  적용: ${updates.length}건 / 유지(스킵): ${skipped.length}건`);

  // ④ 배치 커밋 (400건씩)
  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + CHUNK);
    for (const u of chunk) {
      batch.update(db.collection('books').doc(u.bookId), { publisher: u.code });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  진행: ${done}/${updates.length}건`);
  }

  // ⑤ 출판사별 요약
  console.log('\n━━━ ③ 출판사별 적용 건수 ━━━');
  const pubCounts = {};
  for (const u of updates) {
    pubCounts[u.pub] = (pubCounts[u.pub] || 0) + 1;
  }
  for (const [pub, cnt] of Object.entries(pubCounts).sort((a, b) => b[1] - a[1])) {
    const code = GEN_NAME_TO_CODE[pub] || '(기존)';
    console.log(`  ${pub} [${code}]: ${cnt}건`);
  }
  console.log(`\n총 ${updates.length}건 적용 완료`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
