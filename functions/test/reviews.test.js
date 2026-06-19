const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPORT_HIDE_THRESHOLD,
  classifyReview,
  defaultNickname,
  reportDocumentId,
  reviewDocumentId,
  validateReviewInput,
} = require('../reviews');

test('reviewDocumentId is deterministic per book and uid', () => {
  assert.equal(reviewDocumentId('book-1', 'uid-1'), reviewDocumentId('book-1', 'uid-1'));
  assert.notEqual(reviewDocumentId('book-1', 'uid-1'), reviewDocumentId('book-1', 'uid-2'));
});

test('reportDocumentId permits only one report per review and reporter', () => {
  assert.equal(reportDocumentId('review-1', 'uid-1'), reportDocumentId('review-1', 'uid-1'));
  assert.notEqual(reportDocumentId('review-1', 'uid-1'), reportDocumentId('review-1', 'uid-2'));
});

test('defaultNickname never exposes uid and keeps stable four-character suffix', () => {
  const nickname = defaultNickname('secret-user-uid');
  assert.match(nickname, /^익명의 독자 [0-9A-F]{4}$/);
  assert.equal(nickname, defaultNickname('secret-user-uid'));
  assert.equal(nickname.includes('secret-user-uid'), false);
});

test('validateReviewInput trims valid input', () => {
  assert.deepEqual(validateReviewInput({
    book_id: ' book-1 ',
    user_name: ' 독자 ',
    review: ' 좋은 책이었습니다. ',
    rating: 5,
    policy_version: '2026-06-19',
  }), {
    bookId: 'book-1',
    userName: '독자',
    review: '좋은 책이었습니다.',
    rating: 5,
    policyVersion: '2026-06-19',
  });
});

test('validateReviewInput rejects invalid rating and empty content', () => {
  assert.throws(() => validateReviewInput({
    book_id: 'book-1', user_name: '독자', review: ' ', rating: 5,
    policy_version: '2026-06-19',
  }), /review/);
  assert.throws(() => validateReviewInput({
    book_id: 'book-1', user_name: '독자', review: '좋아요', rating: 6,
    policy_version: '2026-06-19',
  }), /rating/);
});

test('classifyReview holds contact information and links for moderation', () => {
  assert.equal(classifyReview({ userName: '독자', review: 'https://spam.example' }), 'pending');
  assert.equal(classifyReview({ userName: '010-1234-5678', review: '연락주세요' }), 'pending');
  assert.equal(classifyReview({ userName: '독자', review: 'hello@example.com' }), 'pending');
  assert.equal(classifyReview({ userName: '독자', review: '인상 깊고 좋은 책이었어요.' }), 'published');
});

test('automatic hiding requires three distinct reporters', () => {
  assert.equal(REPORT_HIDE_THRESHOLD, 3);
});
