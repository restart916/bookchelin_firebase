'use strict';
const path = require('path');
const admin = require('firebase-admin');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('books').get();
  const empty = snap.docs
    .filter(d => {
      const pub = d.data().publisher;
      return pub === undefined || pub === null || pub === '';
    })
    .map(d => ({ id: d.id, title: String(d.data().title || '') }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'));

  console.log('publisher 빈 책 총 ' + empty.length + '건:\n');
  console.log('bookId\t제목');
  for (const b of empty) {
    console.log(b.id + '\t' + b.title);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
