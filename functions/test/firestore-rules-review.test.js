const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('review Firestore rules require emulator', { skip: true }, () => {});
} else {
  test('reviews are public to read but protected from direct client writes', async () => {
    const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
    const env = await initializeTestEnvironment({
      projectId: `bookchelin-review-rules-${Date.now()}`,
      firestore: { rules },
    });
    try {
      await env.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'book_reviews', 'review-1'), {
          book_id: 'book-1', review: '좋은 책이에요', rating: 5,
        });
      });
      const guest = env.unauthenticatedContext().firestore();
      const anonymous = env.authenticatedContext('anonymous-uid').firestore();

      await assertSucceeds(getDoc(doc(guest, 'book_reviews', 'review-1')));
      await assertFails(setDoc(doc(anonymous, 'book_reviews', 'review-2'), {
        book_id: 'book-1', review: '직접 쓰기', rating: 5,
      }));
      await assertFails(getDoc(doc(anonymous, 'review_reports', 'report-1')));
      await assertFails(setDoc(doc(anonymous, 'review_reports', 'report-1'), { reason: 'spam' }));
      await assertFails(getDoc(doc(anonymous, 'review_user_bans', 'anonymous-uid')));
      await assertFails(setDoc(doc(anonymous, 'review_user_bans', 'anonymous-uid'), { active: false }));
      assert.ok(true);
    } finally {
      await env.cleanup();
    }
  });
}
