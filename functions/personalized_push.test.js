const test = require('node:test');
const assert = require('node:assert');

const push = require('./personalized_push');

test('buildPushJobs: 토큰이 없으면 발송 작업이 없다', () => {
  const jobs = push.buildPushJobs({
    tokenRows: [],
    readLogs: [{ user_uid: 'u1', book_id: 'b1', book_title: '책', createdAt: '2026-06-16T10:00:00Z' }],
    now: new Date('2026-06-16T12:00:00Z'),
  });

  assert.deepStrictEqual(jobs, []);
});

test('buildPushJobs: 사용자별 최신 독서 로그와 토큰을 이어읽기 메시지로 묶는다', () => {
  const jobs = push.buildPushJobs({
    tokenRows: [
      { uid: 'u1', token: 'token-a' },
      { uid: 'u2', token: 'token-b' },
    ],
    readLogs: [
      { user_uid: 'u1', book_id: 'old', book_title: '오래된 책', createdAt: '2026-06-14T10:00:00Z' },
      { user_uid: 'u1', book_id: 'new', book_title: '새 책', createdAt: '2026-06-16T10:00:00Z' },
      { user_uid: 'u3', book_id: 'no-token', book_title: '토큰 없음', createdAt: '2026-06-16T10:00:00Z' },
    ],
    now: new Date('2026-06-16T12:00:00Z'),
  });

  assert.strictEqual(jobs.length, 1);
  const { tokenRows, ...publicJob } = jobs[0];
  assert.strictEqual(tokenRows.length, 1);
  assert.deepStrictEqual(publicJob, {
    uid: 'u1',
    tokens: ['token-a'],
    bookId: 'new',
    title: '읽던 책 이어볼까요?',
    body: '새 책, 이어서 읽기 좋은 시간이에요.',
    data: {
      type: 'continue_reading',
      book_id: 'new',
    },
  });
});

test('buildPushJobs: 24시간 안에 이미 보낸 사용자는 제외한다', () => {
  const jobs = push.buildPushJobs({
    tokenRows: [
      { uid: 'u1', token: 'token-a', lastSentAt: new Date('2026-06-16T01:00:00Z') },
      { uid: 'u2', token: 'token-b', lastSentAt: new Date('2026-06-14T01:00:00Z') },
    ],
    readLogs: [
      { user_uid: 'u1', book_id: 'b1', book_title: '책1', createdAt: '2026-06-16T09:00:00Z' },
      { user_uid: 'u2', book_id: 'b2', book_title: '책2', createdAt: '2026-06-16T09:00:00Z' },
    ],
    now: new Date('2026-06-16T12:00:00Z'),
  });

  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].uid, 'u2');
});

test('isInvalidFcmTokenCode: Firebase invalid token errors만 true', () => {
  assert.strictEqual(push.isInvalidFcmTokenCode('messaging/registration-token-not-registered'), true);
  assert.strictEqual(push.isInvalidFcmTokenCode('messaging/invalid-registration-token'), true);
  assert.strictEqual(push.isInvalidFcmTokenCode('messaging/internal-error'), false);
});
