/**
 * 활성(is_active=true) time_event와 limit_event를 책 제목과 함께 조회.
 *
 * 사용:
 *   GOOGLE_APPLICATION_CREDENTIALS=./bookchelin-firebase-adminsdk-*.json \
 *     node check_active_events.js
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(KEY_PATH)) {
    admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
  } else {
    console.error('서비스 계정 키를 찾을 수 없습니다.');
    process.exit(1);
  }
}

async function main() {
  const db = admin.firestore();

  console.log('=== time_event where is_active==true ===');
  const timeSnap = await db.collection('time_event').where('is_active', '==', true).get();
  console.log(`총 ${timeSnap.size}건`);
  for (const doc of timeSnap.docs) {
    const d = doc.data();
    let title = '(book not found)';
    if (d.book_id) {
      const bookDoc = await db.collection('books').doc(d.book_id).get();
      if (bookDoc.exists) title = bookDoc.data().title || '(no title)';
    }
    console.log(`  ${doc.id} → book_id=${d.book_id} "${title}" remain_time=${d.remain_time} event_minute=${d.event_minute} hidden(book)=${
      d.book_id ? (await db.collection('books').doc(d.book_id).get()).data()?.hidden : '?'
    }`);
  }

  console.log('\n=== limit_event where is_active==true ===');
  const limitSnap = await db.collection('limit_event').where('is_active', '==', true).get();
  console.log(`총 ${limitSnap.size}건`);
  for (const doc of limitSnap.docs) {
    const d = doc.data();
    let title = '(book not found)';
    if (d.book_id) {
      const bookDoc = await db.collection('books').doc(d.book_id).get();
      if (bookDoc.exists) title = bookDoc.data().title || '(no title)';
    }
    console.log(`  ${doc.id} → book_id=${d.book_id} "${title}" remain_time=${d.remain_time ?? '-'} limit_seconds=${d.limit_seconds} user_count=${d.user_count}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
