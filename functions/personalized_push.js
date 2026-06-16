const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_LOOKBACK_DAYS = 3;

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function hoursBetween(a, b) {
  return (a.getTime() - b.getTime()) / (60 * 60 * 1000);
}

function isCoolingDown(lastSentAt, now, cooldownHours = DEFAULT_COOLDOWN_HOURS) {
  const sentAt = parseDate(lastSentAt);
  if (!sentAt) return false;
  return hoursBetween(now, sentAt) < cooldownHours;
}

function latestReadLogByUser(readLogs, eligibleUids) {
  const latest = new Map();
  for (const log of readLogs) {
    const uid = log.user_uid;
    const bookId = log.book_id;
    if (!uid || !bookId || !eligibleUids.has(uid)) continue;

    const createdAt = parseDate(log.createdAt || log.datetime);
    if (!createdAt) continue;

    const prev = latest.get(uid);
    if (!prev || createdAt > prev.createdAt) {
      latest.set(uid, {
        uid,
        bookId,
        bookTitle: typeof log.book_title === 'string' ? log.book_title.trim() : '',
        createdAt,
      });
    }
  }
  return latest;
}

function buildBody(bookTitle) {
  if (bookTitle) {
    return `${bookTitle}, 이어서 읽기 좋은 시간이에요.`;
  }
  return '읽던 책, 이어서 읽기 좋은 시간이에요.';
}

function buildPushJobs({
  tokenRows,
  readLogs,
  now = new Date(),
  cooldownHours = DEFAULT_COOLDOWN_HOURS,
}) {
  const tokensByUid = new Map();

  for (const row of tokenRows) {
    if (!row.uid || !row.token || row.disabled === true) continue;
    if (isCoolingDown(row.lastSentAt, now, cooldownHours)) continue;

    const existing = tokensByUid.get(row.uid) || [];
    existing.push(row);
    tokensByUid.set(row.uid, existing);
  }

  if (tokensByUid.size === 0) return [];

  const latest = latestReadLogByUser(readLogs, new Set(tokensByUid.keys()));
  const jobs = [];
  for (const [uid, rows] of tokensByUid.entries()) {
    const read = latest.get(uid);
    if (!read) continue;

    jobs.push({
      uid,
      tokens: [...new Set(rows.map((row) => row.token))],
      tokenRows: rows,
      bookId: read.bookId,
      title: '읽던 책 이어볼까요?',
      body: buildBody(read.bookTitle),
      data: {
        type: 'continue_reading',
        book_id: read.bookId,
      },
    });
  }

  return jobs;
}

function isInvalidFcmTokenCode(code) {
  return code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token';
}

function kstLookbackDateString(now, days) {
  const time = now.getTime() + (9 * 60 * 60 * 1000) - (days * 24 * 60 * 60 * 1000);
  return new Date(time).toISOString().slice(0, 10);
}

async function loadTokenRows(db) {
  const snap = await db.collectionGroup('fcm_tokens').get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const uid = doc.ref?.parent?.parent?.id;
    return {
      uid,
      token: typeof data.token === 'string' ? data.token.trim() : '',
      disabled: data.disabled === true,
      lastSentAt: data.last_sent_at,
      ref: doc.ref,
    };
  }).filter((row) => row.uid && row.token);
}

async function loadRecentReadLogs(db, sinceDateString) {
  const snap = await db
    .collection('read_time_logs')
    .where('createdAt', '>=', sinceDateString)
    .get();

  return snap.docs.map((doc) => doc.data() || {});
}

async function sendJob(messaging, job, dryRun = false) {
  if (dryRun) {
    return {
      uid: job.uid,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      dryRun: true,
    };
  }

  const response = await messaging.sendEachForMulticast({
    tokens: job.tokens,
    notification: {
      title: job.title,
      body: job.body,
    },
    data: job.data,
    android: {
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    const code = result.error?.code;
    if (code && isInvalidFcmTokenCode(code)) {
      invalidTokens.push(job.tokens[index]);
    }
  });

  return {
    uid: job.uid,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
    dryRun: false,
  };
}

async function markSentAndDisableInvalid({ admin, jobs, sendResults }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const invalid = new Set(sendResults.flatMap((r) => r.invalidTokens || []));
  const writes = [];

  for (const job of jobs) {
    for (const row of job.tokenRows || []) {
      if (!row.ref) continue;
      if (invalid.has(row.token)) {
        writes.push(row.ref.set({
          disabled: true,
          disabled_at: now,
        }, { merge: true }));
      } else {
        writes.push(row.ref.set({
          last_sent_at: now,
        }, { merge: true }));
      }
    }
  }

  await Promise.all(writes);
  return { writes: writes.length, invalidTokens: invalid.size };
}

async function sendDailyPersonalizedPush({
  db,
  admin,
  messaging,
  now = new Date(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  dryRun = false,
}) {
  const tokenRows = await loadTokenRows(db);
  if (tokenRows.length === 0) {
    return {
      ok: true,
      dryRun,
      tokenCount: 0,
      readLogCount: 0,
      jobCount: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokens: 0,
    };
  }

  const readLogs = await loadRecentReadLogs(db, kstLookbackDateString(now, lookbackDays));
  const jobs = buildPushJobs({ tokenRows, readLogs, now });
  const sendResults = await Promise.all(jobs.map((job) => sendJob(messaging, job, dryRun)));

  let writeResult = { writes: 0, invalidTokens: 0 };
  if (!dryRun && jobs.length > 0) {
    writeResult = await markSentAndDisableInvalid({ admin, jobs, sendResults });
  }

  return {
    ok: true,
    dryRun,
    tokenCount: tokenRows.length,
    readLogCount: readLogs.length,
    jobCount: jobs.length,
    successCount: sendResults.reduce((sum, r) => sum + r.successCount, 0),
    failureCount: sendResults.reduce((sum, r) => sum + r.failureCount, 0),
    invalidTokens: writeResult.invalidTokens,
    writes: writeResult.writes,
  };
}

module.exports = {
  DEFAULT_COOLDOWN_HOURS,
  DEFAULT_LOOKBACK_DAYS,
  buildPushJobs,
  isInvalidFcmTokenCode,
  sendDailyPersonalizedPush,
};
