const crypto = require('crypto');
const functions = require('firebase-functions/v1');

const REPORT_HIDE_THRESHOLD = 3;
const ADMIN_EMAILS = new Set(['restart916@gmail.com', 'helgi2019@gmail.com']);
const REPORT_REASONS = new Set(['spam', 'offensive', 'harassment', 'inappropriate', 'other']);
const CONTACT_PATTERN = /(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|01[016789][ -]?\d{3,4}[ -]?\d{4})/i;
const OBJECTIONABLE_PATTERN = /(씨발|시발|병신|개새끼|좆|fuck|porn)/i;

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function reviewDocumentId(bookId, uid) {
  return digest(`${bookId}:${uid}`).slice(0, 40);
}

function reportDocumentId(reviewId, uid) {
  return digest(`${reviewId}:${uid}`).slice(0, 40);
}

function defaultNickname(uid) {
  return `익명의 독자 ${digest(uid).slice(0, 4).toUpperCase()}`;
}

function requireText(value, field, min, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) {
    throw new Error(`${field} must be ${min}-${max} characters`);
  }
  return text;
}

function validateReviewInput(data) {
  const rating = Number(data && data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('rating must be an integer from 1 to 5');
  }
  return {
    bookId: requireText(data.book_id, 'book_id', 1, 200),
    userName: requireText(data.user_name, 'user_name', 1, 20),
    review: requireText(data.review, 'review', 2, 1000),
    rating,
    policyVersion: requireText(data.policy_version, 'policy_version', 1, 30),
  };
}

function classifyReview(review) {
  const text = `${review.userName || ''} ${review.review || ''}`;
  return CONTACT_PATTERN.test(text) || OBJECTIONABLE_PATTERN.test(text) ?
    'pending' : 'published';
}

function resolveModerationStatus(classification, existing = {}) {
  if (classification === 'pending') return 'pending';
  if (existing.moderation_status === 'hidden' ||
      Number(existing.report_count) >= REPORT_HIDE_THRESHOLD) return 'pending';
  return 'published';
}

function requireAuth(context) {
  const uid = context && context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  return uid;
}

function requireAdmin(context) {
  requireAuth(context);
  const email = context.auth.token && context.auth.token.email;
  if (!ADMIN_EMAILS.has(email)) {
    throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
  }
  return email;
}

function inputError(error) {
  if (error instanceof functions.https.HttpsError) return error;
  return new functions.https.HttpsError('invalid-argument', error.message);
}

function createReviewHandlers({ db, admin }) {
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

  async function submitReview(data, context) {
    const uid = requireAuth(context);
    let input;
    try {
      input = validateReviewInput(data || {});
    } catch (error) {
      throw inputError(error);
    }
    const reviewId = reviewDocumentId(input.bookId, uid);
    const reviewRef = db.collection('book_reviews').doc(reviewId);
    const banRef = db.collection('review_user_bans').doc(uid);
    const classification = classifyReview(input);
    let moderationStatus = classification;

    await db.runTransaction(async (transaction) => {
      const [reviewDoc, banDoc] = await Promise.all([
        transaction.get(reviewRef), transaction.get(banRef),
      ]);
      if (banDoc.exists && banDoc.data().active !== false) {
        throw new functions.https.HttpsError(
          'permission-denied', '리뷰 작성이 제한된 사용자입니다.'
        );
      }
      if (reviewDoc.exists && reviewDoc.data().user_uid !== uid) {
        throw new functions.https.HttpsError('permission-denied', '수정 권한이 없습니다.');
      }
      const existing = reviewDoc.exists ? reviewDoc.data() : {};
      moderationStatus = resolveModerationStatus(classification, existing);
      const document = {
        book_id: input.bookId,
        user_uid: uid,
        user_name: input.userName || defaultNickname(uid),
        review: input.review,
        rating: input.rating,
        policy_version: input.policyVersion,
        moderation_status: moderationStatus,
        report_count: Number(existing.report_count) || 0,
        created_at: existing.created_at || timestamp(),
        updated_at: timestamp(),
      };
      if (moderationStatus === 'pending') {
        document.hide = '1';
      } else {
        document.hide = admin.firestore.FieldValue.delete();
      }
      transaction.set(reviewRef, document, { merge: true });
    });
    return { ok: true, review_id: reviewId, moderation_status: moderationStatus };
  }

  async function deleteReview(data, context) {
    const uid = requireAuth(context);
    const reviewId = requireText(data && data.review_id, 'review_id', 1, 200);
    const reviewRef = db.collection('book_reviews').doc(reviewId);
    await db.runTransaction(async (transaction) => {
      const reviewDoc = await transaction.get(reviewRef);
      if (!reviewDoc.exists) return;
      if (reviewDoc.data().user_uid !== uid) {
        throw new functions.https.HttpsError('permission-denied', '삭제 권한이 없습니다.');
      }
      transaction.delete(reviewRef);
    });
    await closeOpenReports(reviewId, 'reviewed');
    return { ok: true };
  }

  async function reportReview(data, context) {
    const uid = requireAuth(context);
    const reviewId = requireText(data && data.review_id, 'review_id', 1, 200);
    const reason = requireText(data && data.reason, 'reason', 1, 30);
    if (!REPORT_REASONS.has(reason)) {
      throw new functions.https.HttpsError('invalid-argument', '신고 사유가 올바르지 않습니다.');
    }
    const detail = typeof data.detail === 'string' ? data.detail.trim().slice(0, 500) : '';
    const reviewRef = db.collection('book_reviews').doc(reviewId);
    const reportRef = db.collection('review_reports').doc(reportDocumentId(reviewId, uid));
    let duplicate = false;
    let reportCount = 0;

    await db.runTransaction(async (transaction) => {
      const [reviewDoc, reportDoc] = await Promise.all([
        transaction.get(reviewRef), transaction.get(reportRef),
      ]);
      if (!reviewDoc.exists) {
        throw new functions.https.HttpsError('not-found', '리뷰를 찾을 수 없습니다.');
      }
      const review = reviewDoc.data();
      if (review.user_uid === uid) {
        throw new functions.https.HttpsError('failed-precondition', '자신의 리뷰는 신고할 수 없습니다.');
      }
      if (reportDoc.exists) {
        duplicate = true;
        reportCount = Number(review.report_count) || 0;
        return;
      }
      reportCount = (Number(review.report_count) || 0) + 1;
      transaction.create(reportRef, {
        review_id: reviewId,
        book_id: review.book_id || '',
        review_author_uid: review.user_uid || '',
        reporter_uid: uid,
        reason,
        detail,
        created_at: timestamp(),
        status: 'open',
      });
      const update = { report_count: reportCount, updated_at: timestamp() };
      if (reportCount >= REPORT_HIDE_THRESHOLD) {
        update.hide = '1';
        update.moderation_status = 'hidden';
      }
      transaction.update(reviewRef, update);
    });
    return { ok: true, duplicate, report_count: reportCount };
  }

  async function adminListReviewReports(data, context) {
    requireAdmin(context);
    const [reportsSnapshot, pendingSnapshot] = await Promise.all([
      db.collection('review_reports').where('status', '==', 'open').limit(200).get(),
      db.collection('book_reviews').where('moderation_status', '==', 'pending').limit(200).get(),
    ]);
    const reports = reportsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const pending = pendingSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return { reports, pending };
  }

  async function closeOpenReports(reviewId, status) {
    const snapshot = await db.collection('review_reports')
      .where('review_id', '==', reviewId).get();
    const batch = db.batch();
    snapshot.docs.filter((doc) => doc.data().status === 'open')
      .forEach((doc) => batch.update(doc.ref, { status, reviewed_at: timestamp() }));
    await batch.commit();
  }

  async function adminModerateReview(data, context) {
    const adminEmail = requireAdmin(context);
    const reviewId = requireText(data && data.review_id, 'review_id', 1, 200);
    const action = requireText(data && data.action, 'action', 1, 30);
    const reviewRef = db.collection('book_reviews').doc(reviewId);
    const reviewDoc = await reviewRef.get();
    if (!reviewDoc.exists) {
      throw new functions.https.HttpsError('not-found', '리뷰를 찾을 수 없습니다.');
    }
    const review = reviewDoc.data();
    const audit = { moderated_at: timestamp(), moderated_by: adminEmail };

    if (action === 'hide') {
      await reviewRef.update({ ...audit, hide: '1', moderation_status: 'hidden' });
    } else if (action === 'restore') {
      await reviewRef.update({
        ...audit,
        hide: admin.firestore.FieldValue.delete(),
        moderation_status: 'published',
        report_count: 0,
      });
      await closeOpenReports(reviewId, 'reviewed');
    } else if (action === 'dismiss') {
      await closeOpenReports(reviewId, 'dismissed');
    } else if (action === 'ban' || action === 'unban') {
      const authorUid = requireText(review.user_uid, 'user_uid', 1, 200);
      await db.collection('review_user_bans').doc(authorUid).set({
        active: action === 'ban',
        updated_at: timestamp(),
        updated_by: adminEmail,
      }, { merge: true });
      if (action === 'ban') {
        await reviewRef.update({ ...audit, hide: '1', moderation_status: 'hidden' });
      }
    } else {
      throw new functions.https.HttpsError('invalid-argument', '지원하지 않는 처리입니다.');
    }
    return { ok: true };
  }

  return {
    submitReview,
    deleteReview,
    reportReview,
    adminListReviewReports,
    adminModerateReview,
  };
}

module.exports = {
  REPORT_HIDE_THRESHOLD,
  classifyReview,
  createReviewHandlers,
  defaultNickname,
  reportDocumentId,
  resolveModerationStatus,
  reviewDocumentId,
  validateReviewInput,
};
