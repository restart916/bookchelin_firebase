// [START functionsimport]
// v1 API namespace (firebase-functions 7.x). These triggers stay on v1 — the
// v2 migration is a separate, deliberate project (see CLAUDE.md). Importing the
// explicit /v1 path keeps them working across major bumps.
const functions = require('firebase-functions/v1');
// [END functionsimport]
// [START additionalimports]
// Moments library to format dates.
// const moment = require('moment');
const moment = require('moment-timezone');
// moment.tz.setDefault('utc')

// CORS Express middleware to enable CORS Requests.
const cors = require('cors')({
  origin: true,
});
const admin = require('firebase-admin');
admin.initializeApp();

const axios = require('axios').default;
// admin.initializeApp({
//   credential: admin.credential.applicationDefault()
// });

// [END additionalimports]
const db = admin.firestore();
const { generateHomeDynamic, formatCurationMessage } = require('./home_dynamic');
const { fetchAndStoreDau } = require('./analytics_dau');
const { sendDauReport } = require('./analytics_discord');
const { notifyDiscord, discordWebhook } = require('./discord');
const { handleWebBook } = require('./web_book');
const { getActiveBooks, rebuildActiveBooksCache } = require('./event_cache');
const { sendDailyPersonalizedPush } = require('./personalized_push');
const { createReviewHandlers } = require('./reviews');

// read_time_logs 보관 기간(일). TTL 정책용 expireAt 필드 계산에 사용.
// Firestore 네이티브 TTL: Firebase Console → Firestore → Indexes → TTL → read_time_logs / expireAt
const RETENTION_DAYS = 180;

const reviewHandlers = createReviewHandlers({ db, admin });
exports.submitReview = functions.https.onCall(reviewHandlers.submitReview);
exports.deleteReview = functions.https.onCall(reviewHandlers.deleteReview);
exports.reportReview = functions.https.onCall(reviewHandlers.reportReview);
exports.adminListReviewReports = functions.https.onCall(reviewHandlers.adminListReviewReports);
exports.adminModerateReview = functions.https.onCall(reviewHandlers.adminModerateReview);

// [START trigger]
exports.date = functions.https.onRequest((req, res) => {
  if (req.method === 'PUT') {
    return res.status(403).send('Forbidden!');
  }

  return cors(req, res, () => {
    let format = req.query.format;
    if (!format) {
      format = req.body.format;
    }
    const formattedDate = moment().format(format);
    console.log('Sending Formatted date:', formattedDate);
    res.status(200).send(formattedDate);
  });
});

exports.addMessage = functions.https.onRequest(async (req, res) => {
  const original = req.query.text;

  const writeResult = await admin
    .firestore()
    .collection('messages')
    .add({ original: original });
  res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

updateReadLog = async () => {
  let today = moment().format('YYYY-MM-DD');
  let docs = await db
    .collection('read_logs')
    .where('createdAt', '>=', today)
    .get();

  let count_data = {};
  for (let doc of docs.docs) {
    // console.log(doc.id, " => ", doc.data())
    let read_info = doc.data();
    let book_id = read_info.book_id;
    if (book_id in count_data) {
      count_data[book_id] += 1;
    } else {
      count_data[book_id] = 1;
    }
  }

  db.collection('dayly_total').doc(today).set({ total_count: count_data });
};

updateReadTimeLog = async () => {
  let today = moment().format('YYYY-MM-DD');
  let docs = await db
    .collection('read_time_logs')
    .where('createdAt', '>=', today)
    .get();

  let count_data = {};
  let count_data_by_user = {};
  // P2-2: book별 고유 독자 uid 집합 (dayly_reader_count 집계용)
  let readers_by_book = {};
  for (let doc of docs.docs) {
    // console.log(doc.id, " => ", doc.data())
    let read_info = doc.data();
    let book_id = read_info.book_id;
    if (book_id in count_data) {
      count_data[book_id] += read_info.read_time;
    } else {
      count_data[book_id] = read_info.read_time;
    }

    let user_uid = read_info.user_uid;
    if (user_uid !== undefined) {
      if (user_uid in count_data_by_user) {
        count_data_by_user[user_uid] += read_info.read_time;
      } else {
        count_data_by_user[user_uid] = read_info.read_time;
      }
      if (book_id) {
        if (!readers_by_book[book_id]) readers_by_book[book_id] = new Set();
        readers_by_book[book_id].add(user_uid);
      }
    }
  }

  // book별 하루 고유 독자 수 집계. aggregateReadersFromDailyDocs 가 읽는 컬렉션.
  // 주의: 같은 독자가 며칠에 걸쳐 읽으면 날짜마다 별도 카운트 → 크로스데이 중복 포함.
  const reader_count_data = {};
  for (const [book_id, uids] of Object.entries(readers_by_book)) {
    reader_count_data[book_id] = uids.size;
  }

  db.collection('dayly_total_time').doc(today).set({ total_count: count_data });
  db.collection('dayly_total_time_by_user').doc(today).set({
    data: count_data_by_user,
    time: new Date(),
  });
  db.collection('dayly_reader_count').doc(today).set({ reader_count: reader_count_data });
};

function addItem(user_uid, data) {
  return new Promise((resolve) => {
    db.collection('total_time_by_user').doc(user_uid).set(data);
    setTimeout(resolve, 5);
  });
}

updateSummary = async () => {
  let docs = await db.collection('dayly_total_time_by_user').get();

  let count_data_by_user = {};
  for (let doc of docs.docs) {
    // console.log(doc.id, " => ", doc.data());
    let user_read_datas = doc.data().data;
    let data_time = doc.data().time;

    for (let user_uid in user_read_datas) {
      if (user_uid in count_data_by_user) {
        count_data_by_user[user_uid].time += user_read_datas[user_uid];

        count_data_by_user[user_uid].start =
          data_time.toMillis() < count_data_by_user[user_uid].start.toMillis()
            ? data_time
            : count_data_by_user[user_uid].start;
      } else {
        count_data_by_user[user_uid] = {
          start: data_time,
          time: user_read_datas[user_uid],
        };
      }
    }
  }

  /* eslint-disable no-await-in-loop */
  for (let user_uid in count_data_by_user) {
    let data = count_data_by_user[user_uid];
    start_time = data.start;
    diff = moment().diff(moment(start_time.toMillis()), 'days');
    diff = Math.max(diff, 1);
    data.average = data.time / diff;

    await addItem(user_uid, data);
  }
  /* eslint-enable no-await-in-loop */
};

updateTimeEvent = async (book_id, user_uid, read_time, datetime) => {
  // const book_id = '02IEPKaGI0PrgxhfXbkz';
  let docs = await db
    .collection('time_event')
    .where('book_id', '==', book_id)
    .get();
  /* eslint-disable no-await-in-loop */
  for (let doc of docs.docs) {
    // console.log('doc.data()', doc.data());
    let data = doc.data();

    if (data.has_subcollection_history !== true) {
      console.warn('unmigrated time_event encountered: ' + doc.id);
      continue;
    }

    // read_history 는 서브컬렉션에 저장됨. 트랜잭션으로 원자적 갱신.
    let parentRef = doc.ref;
    let userRef = parentRef.collection('read_history').doc(user_uid);
    await db.runTransaction(async (tx) => {
      let parentSnap = await tx.get(parentRef);
      let userSnap = await tx.get(userRef);
      let parentData = parentSnap.data() || {};
      let eventMinute =
        typeof parentData.event_minute === 'number'
          ? parentData.event_minute
          : 0;
      let prevTotal =
        typeof parentData.total_read_time === 'number'
          ? parentData.total_read_time
          : 0;
      let prevUserCount =
        typeof parentData.user_count === 'number' ? parentData.user_count : 0;

      let newTotal = prevTotal + read_time;
      let newUserCount = prevUserCount;

      if (userSnap.exists) {
        let userData = userSnap.data() || {};
        let prevReadTime =
          typeof userData.read_time === 'number' ? userData.read_time : 0;
        let prevDatetime = Array.isArray(userData.datetime)
          ? userData.datetime
          : [];
        tx.update(userRef, {
          read_time: prevReadTime + read_time,
          datetime: prevDatetime.concat([datetime]),
        });
      } else {
        tx.set(userRef, {
          read_time: read_time,
          datetime: [datetime],
        });
        newUserCount = prevUserCount + 1;
      }

      let remain = eventMinute - newTotal;
      if (remain < 0) remain = 0;

      console.log('time', eventMinute, newTotal);

      tx.update(parentRef, {
        total_read_time: newTotal,
        user_count: newUserCount,
        remain_time: remain,
      });
    });
  }
  /* eslint-enable no-await-in-loop */
};

updateLimitEvent = async (book_id, user_uid, read_time, datetime) => {
  let docs = await db
    .collection('limit_event')
    .where('book_id', '==', book_id)
    .get();
  /* eslint-disable no-await-in-loop */
  for (let doc of docs.docs) {
    let data = doc.data();

    if (data.has_subcollection_history !== true) {
      console.warn('unmigrated limit_event encountered: ' + doc.id);
      continue;
    }

    // read_history 는 서브컬렉션에 저장됨. 트랜잭션으로 원자적 갱신.
    let parentRef = doc.ref;
    let userRef = parentRef.collection('read_history').doc(user_uid);
    await db.runTransaction(async (tx) => {
      let parentSnap = await tx.get(parentRef);
      let userSnap = await tx.get(userRef);
      let parentData = parentSnap.data() || {};
      let prevTotal =
        typeof parentData.total_read_time === 'number'
          ? parentData.total_read_time
          : 0;
      let prevUserCount =
        typeof parentData.user_count === 'number' ? parentData.user_count : 0;

      let newTotal = prevTotal + read_time;
      let newUserCount = prevUserCount;

      if (userSnap.exists) {
        let userData = userSnap.data() || {};
        let prevTotalTime =
          typeof userData.total_time === 'number' ? userData.total_time : 0;
        let prevLogs = Array.isArray(userData.logs) ? userData.logs : [];
        tx.update(userRef, {
          total_time: prevTotalTime + read_time,
          logs: prevLogs.concat([
            { read_time: read_time, datetime: datetime },
          ]),
        });
      } else {
        tx.set(userRef, {
          total_time: read_time,
          logs: [{ read_time: read_time, datetime: datetime }],
        });
        newUserCount = prevUserCount + 1;
      }

      tx.update(parentRef, {
        total_read_time: newTotal,
        user_count: newUserCount,
      });
    });
  }
  /* eslint-enable no-await-in-loop */
};

updateEventSummaryByDay = async (start_moment) => {
  let time_datas = await loadEventData('time_event', start_moment);
  let limit_datas = await loadEventData('limit_event', start_moment);

  db.collection('dayly_event_count')
    .doc(start_moment.format('YYYY-MM-DD'))
    .set({ time_datas: time_datas, limit_datas: limit_datas });
};

updateEventSummary = async () => {
  const results = [];
  const start = 0;
  const count = 2;

  for (let i = start; i < start + count; i++) {
    let start_moment = moment().add(-i, 'days');
    console.log('----------------', i, start_moment);
    results.push(updateEventSummaryByDay(start_moment));
  }
  await Promise.all(results);
};

loadEventUnitData = async (datas, time_event, start_date, end_date) => {
  const event_id = time_event.id;
  const time_event_data = time_event.data();
  if (!time_event_data['book_id']) {
    console.log(
      'time_event_data',
      time_event_data['book_id'],
      time_event_data['create_time'],
      time_event_data['is_active'],
      time_event_data['remain_time']
    );
    return;
  }

  datas[event_id] = { book_id: time_event_data['book_id'] };

  const book_data = await db
    .collection('books')
    .doc(time_event_data['book_id'])
    .get();

  datas[event_id]['book_name'] = book_data.data()
    ? book_data.data()['title']
    : '';
  datas[event_id]['create_time'] = time_event_data['create_time'] || '';

  // console.log('datas', datas);
  const show_new_main_books = await db
    .collection('show_new_main_books')
    .where('event_id', '==', event_id)
    .where('datetime', '>=', moment(start_date).unix())
    .where('datetime', '<', moment(end_date).unix())
    .get();

  datas[event_id]['show_new_main_books'] = show_new_main_books.docs.length;
  let show_new_main_users = [];
  for (let show_new_main_detail of show_new_main_books.docs) {
    const user_uid = show_new_main_detail.data().user_uid;
    if (show_new_main_users.includes(user_uid) === false) {
      show_new_main_users.push(user_uid);
    }
  }
  datas[event_id].show_new_main_user_count = show_new_main_users.length;

  const show_book_details = await db
    .collection('show_book_detail')
    .where('event_id', '==', event_id)
    .where('datetime', '>=', moment(start_date).unix())
    .where('datetime', '<', moment(end_date).unix())
    .get();

  datas[event_id].show_detail_count = show_book_details.docs.length;
  // console.log('show_detail_count', show_book_details)

  let show_book_users = [];
  for (let show_book_detail of show_book_details.docs) {
    const user_uid = show_book_detail.data().user_uid;
    if (show_book_users.includes(user_uid) === false) {
      show_book_users.push(user_uid);
    }
  }

  datas[event_id]['show_detail_user_count'] = show_book_users.length;
  // console.log(show_book_details)
  // console.log(show_book_users.length, show_book_users)

  const show_book_readers = await db
    .collection('show_book_reader')
    .where('event_id', '==', event_id)
    .where('datetime', '>=', moment(start_date).unix())
    .where('datetime', '<', moment(end_date).unix())
    .get();

  datas[event_id]['show_reader_count'] = show_book_readers.docs.length;
  let show_book_reader_users = [];
  for (let show_book_reader of show_book_readers.docs) {
    const user_uid = show_book_reader.data()['user_uid'];
    if (show_book_reader_users.includes(user_uid) === false) {
      show_book_reader_users.push(user_uid);
    }
  }
  datas[event_id]['show_reader_user_count'] = show_book_reader_users.length;
  // datas[event_id]['show_reader_user_count'] = time_event_data['read_history'].length

  // read_history 는 서브컬렉션으로 이전됨. 부모 문서의 집계 필드를 사용.
  let user_count = time_event_data.user_count || 0;
  let total_read_time = time_event_data.total_read_time || 0;
  datas[event_id]['total_read_time'] = total_read_time;
  datas[event_id]['avg_user_read_time'] =
    user_count > 0 ? total_read_time / user_count : 0;
  // console.log('total_read_time', datas[event_id]['total_read_time'])
  // console.log('avg_user_read_time', datas[event_id]['avg_user_read_time'])

  const click_share_book_details = await db
    .collection('click_share_book_detail')
    .where('event_id', '==', event_id)
    .where('datetime', '>=', moment(start_date).unix())
    .where('datetime', '<', moment(end_date).unix())
    .get();

  datas[event_id]['click_share_book_count'] =
    click_share_book_details.docs.length;

  const click_buy_book_details = await db
    .collection('click_buy_book_detail')
    .where('event_id', '==', event_id)
    .where('datetime', '>=', moment(start_date).unix())
    .where('datetime', '<', moment(end_date).unix())
    .get();

  datas[event_id]['click_buy_book_count'] = click_buy_book_details.docs.length;

  const reviews = await db
    .collection('book_reviews')
    .where('book_id', '==', time_event_data['book_id'])
    .get();

  datas[event_id]['review_count'] = reviews.docs.length;
  let rating = 0;
  for (let review of reviews.docs) {
    rating += review.data()['rating'];
  }
  datas[event_id]['average_review'] = reviews.docs.length
    ? (rating / reviews.docs.length).toFixed(2)
    : 0;
};

loadEventData = async (type, start_moment) => {
  let start_date = moment(start_moment).format('YYYY-MM-DD');
  let end_date = moment(start_moment).add(1, 'days').format('YYYY-MM-DD');

  const time_events = await db.collection(type).get();
  // console.log(time_events);

  console.log('----------------', type, start_date, end_date);

  const results = [];
  let datas = {};
  for (let time_event of time_events.docs) {
    results.push(loadEventUnitData(datas, time_event, start_date, end_date));
  }
  await Promise.all(results);

  // console.log(datas)
  return datas;
};

exports.addTimeStamp = functions.firestore
  .document('read_logs/{document_id}')
  .onCreate((snap, context) => {
    const newValue = snap.data();

    if ('createdAt' in newValue) return snap;

    return snap.ref.set(
      {
        createdAt: context.timestamp,
      },
      { merge: true }
    );
  });

exports.add_time_read_time_logs = functions.firestore
  .document('read_time_logs/{document_id}')
  .onCreate(async (snap, context) => {
    const newValue = snap.data();

    const user_uid = newValue.user_uid || 'unknown';
    const book_id = newValue.book_id;

    // 활성 이벤트가 없는 책은 time_event / limit_event 조회를 스킵해 읽기 비용을 절감한다.
    // event_state/active_books 를 5분 인스턴스 캐시로 읽는다(대부분 히트).
    // 신규 이벤트 반영 지연: 외부에서 이벤트 생성 시 daily_job(자정) 또는
    //   refresh_active_books HTTPS 호출 전까지 최대 5분 추가 지연이 있다.
    const activeBooks = await getActiveBooks(db);
    if (activeBooks.time.has(book_id) || activeBooks.limit.has(book_id)) {
      await updateTimeEvent(book_id, user_uid, newValue.read_time, context.timestamp);
      await updateLimitEvent(book_id, user_uid, newValue.read_time, context.timestamp);
    }

    const docData = snap.data();
    const needsCreatedAt = !('createdAt' in docData);
    const needsExpireAt = !('expireAt' in docData);
    if (!needsCreatedAt && !needsExpireAt) return snap;

    const updates = {};
    if (needsCreatedAt) updates.createdAt = context.timestamp;
    if (needsExpireAt) {
      const base = needsCreatedAt ? context.timestamp : docData.createdAt;
      const baseDate = base && typeof base.toDate === 'function' ? base.toDate() : new Date(base);
      const expire = new Date(baseDate.getTime() + RETENTION_DAYS * 86400000);
      updates.expireAt = admin.firestore.Timestamp.fromDate(expire);
    }
    return snap.ref.set(updates, { merge: true });
  });

// search_index/books 문서를 books/{bookId} 변경에 맞춰 동기화.
// Android 앱이 앱 시작 시 books 컬렉션 전체를 받지 않고,
// 검색 다이얼로그용 최소 필드(id, title, description)만 받도록 하기 위한 인덱스.
// hidden !== true 인 책만 포함하며, 다중 동시 쓰기에 대비해 runTransaction 사용.
exports.update_search_index_on_book_write = functions.firestore
  .document('books/{bookId}')
  .onWrite(async (change, context) => {
    const bookId = context.params.bookId;
    const after = change.after.exists ? change.after.data() : null;

    const indexRef = db.doc('search_index/books');

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(indexRef);
        const data = snap.exists ? snap.data() : { books: [] };
        const books = Array.isArray(data.books) ? data.books : [];

        const filtered = books.filter((b) => b.id !== bookId);

        if (after && after.hidden !== true) {
          filtered.push({
            id: bookId,
            title: typeof after.title === 'string' ? after.title : '',
            description:
              typeof after.description === 'string' ? after.description : '',
          });
        }

        tx.set(indexRef, {
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          books: filtered,
        });
      });
    } catch (err) {
      console.error(
        `update_search_index_on_book_write: transaction failed for bookId=${bookId}`,
        err
      );
      throw err;
    }

    console.log(`update_search_index_on_book_write: ${bookId}`);
    return null;
  });

loadImage = async (title, image_url) => {
  if (!image_url) return;

  try {
    let response = await axios.get(image_url);

    if (response.status === 200) {
      if (response.headers['content-length'] > 700000) {
        console.log(title, image_url, response.headers['content-length']);
      }
    } else {
      console.log('load error :', title, image_url);
    }
  } catch (error) {
    console.log('load error :', title, image_url);
    console.log(error);
  }
};

checkImageSize = async () => {
  // console.log('start books')
  // const book_datas = await db.collection('books').get();
  // for (let book_data of book_datas.docs) {
  //   let title = book_data.data()['title']
  //   let image_url = book_data.data()['image_url']
  //   await loadImage(title, image_url)
  // }
  // console.log('start main_books')
  // const main_books = await db.collection('main_books').get();
  // for (let main_book of main_books.docs) {
  //   let title = main_book.data()['book_id']
  //   let image_url = main_book.data()['firestore_url']
  //   await loadImage(title, image_url)
  // }
  //
  // console.log('start link_select')
  // const link_selects = await db.collection('link_select').get();
  // for (let link_select of link_selects.docs) {
  //   let title = link_select.data()['title']
  //   let image_url = link_select.data()['image_url']
  //   await loadImage(title, image_url)
  // }
  //
  // console.log('start banners')
  // const banners = await db.collection('banners').get();
  // for (let banner of banners.docs) {
  //   let title = banner.data()['link_url']
  //   let image_url = banner.data()['firestore_url']
  //   await loadImage(title, image_url)
  // }
};

exports.test = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB',
  })
  .https.onRequest((req, res) => {
    return cors(req, res, async () => {
      await updateEventSummary(); // 출판사 통계 데이터

      // await checkImageSize();

      res.status(200).send('successful');
    });
  });

exports.get_limit_events = functions
  .runWith({
    timeoutSeconds: 10,
    memory: '512MB',
  })
  .https.onRequest((req, res) => {
    return cors(req, res, async () => {
      let result = [];
      const limitEvents = await db
        .collection('limit_event')
        .where('is_active', '==', true)
        .get();
      /* eslint-disable no-await-in-loop */
      for (let limitEvent of limitEvents.docs) {
        let data = limitEvent.data();

        if (data.has_subcollection_history !== true) {
          console.warn('unmigrated limit_event encountered: ' + limitEvent.id);
          continue;
        }

        let total_time = data['limit_seconds'];
        let book_id = data['book_id'];
        let time_event_user_count = data['time_event_user_count'] || 0;
        let user_count =
          typeof data.user_count === 'number' ? data.user_count : 0;
        let read_count = user_count + time_event_user_count;
        let read_time = 0;

        if (req.query.user_id) {
          let userSnap = await limitEvent.ref
            .collection('read_history')
            .doc(req.query.user_id)
            .get();
          if (userSnap.exists) {
            let ud = userSnap.data() || {};
            read_time = typeof ud.total_time === 'number' ? ud.total_time : 0;
          }
        }

        result.push({
          id: limitEvent.id,
          book_id: book_id,
          read_count: read_count,
          total_time: total_time,
          remain_time: total_time - read_time,
          user_id: req.query.user_id,
        });
      }
      /* eslint-enable no-await-in-loop */

      return res.status(200).send(result);
    });
  });

exports.get_limit_events_asia = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '512MB',
  })
  .region('asia-northeast1')
  .https.onRequest((req, res) => {
    return cors(req, res, async () => {
      let result = [];
      const limitEvents = await db
        .collection('limit_event')
        .where('is_active', '==', true)
        .get();
      /* eslint-disable no-await-in-loop */
      for (let limitEvent of limitEvents.docs) {
        let data = limitEvent.data();

        if (data.has_subcollection_history !== true) {
          console.warn('unmigrated limit_event encountered: ' + limitEvent.id);
          continue;
        }

        let total_time = data['limit_seconds'];
        let book_id = data['book_id'];
        let time_event_user_count = data['time_event_user_count'] || 0;
        let user_count =
          typeof data.user_count === 'number' ? data.user_count : 0;
        let read_count = user_count + time_event_user_count;
        let read_time = 0;

        if (req.query.user_id) {
          let userSnap = await limitEvent.ref
            .collection('read_history')
            .doc(req.query.user_id)
            .get();
          if (userSnap.exists) {
            let ud = userSnap.data() || {};
            read_time = typeof ud.total_time === 'number' ? ud.total_time : 0;
          }
        }

        result.push({
          id: limitEvent.id,
          book_id: book_id,
          read_count: read_count,
          total_time: total_time,
          remain_time: total_time - read_time,
          user_id: req.query.user_id,
        });
      }
      /* eslint-enable no-await-in-loop */

      return res.status(200).send(result);
    });
  });

// 매일 KST 00:00에 실행되는 일간 집계 작업.
// 과거에는 App Engine(appengine/) cron이 'daily-tick' PubSub 토픽을 publish하고
// 이 함수가 .pubsub.topic('daily-tick').onPublish 로 소비하는 구조였으나,
// App Engine 인스턴스를 24/7 살려두는 비용 때문에 Cloud Scheduler 네이티브
// 스케줄(.pubsub.schedule)로 전환했다. App Engine cron/앱은 더 이상 필요 없다.
exports.daily_job = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB',
    secrets: [discordWebhook], // Discord 알림용 웹훅 URL
  })
  .pubsub.schedule('every day 00:00')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    console.log('This job is run every day!');

    // 활성 이벤트 캐시를 먼저 갱신해 당일 로그 트리거가 최신 목록을 참조하도록 한다.
    await rebuildActiveBooksCache(db, admin);
    await updateReadLog(); // 하루에 그 책 몇번 읽었는지
    await updateReadTimeLog(); // 하루에 그 책 몇시간 읽었는지 (유저당으로도)
    // await updateSummary();    // 유저 통계용 데이터 삽입
    await updateEventSummary(); // 출판사 통계 데이터
    const curation = await generateHomeDynamic(db); // 동적 홈 편성(트렌딩/발견 + 자동 추천행)
    // 매일 큐레이션 결과를 Discord 로 알림(실패해도 본 로직은 막지 않음).
    await notifyDiscord(formatCurationMessage(curation));

    return null;
  });

// hourly_job / minutes_job 은 no-op(아무 일도 안 함)이라 삭제했다.
// 이들을 트리거하던 App Engine cron(hourly-tick/minutes-tick)이 매분 인스턴스를
// 깨워 비용을 발생시키던 원인이었다.

// 동적 홈 편성을 수동으로 1회 실행하는 검증용 HTTPS 트리거.
// ?notify=0 으로 호출하면 Discord 알림 없이 데이터만 갱신(테스트 중 채널 도배 방지).
exports.regenerate_home_dynamic = functions
  .runWith({ secrets: [discordWebhook] })
  .https.onRequest(async (req, res) => {
    try {
      const result = await generateHomeDynamic(db);
      console.log('regenerate_home_dynamic done', result.date);
      if (req.query.notify !== '0') {
        await notifyDiscord(formatCurationMessage(result));
      }
      res.status(200).json({
        ok: true,
        date: result.date,
        trending: result.trending.length,
        discover: result.discover.length,
        carousel: result.carousel.length,
      });
    } catch (e) {
      console.error('regenerate_home_dynamic failed', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

// 어드민에서 수동 핀을 바꾸면 다음 daily_job을 기다리지 않고 즉시 홈 편성을 갱신한다.
// 핀 편집마다 Discord 알림을 보내면 운영 채널이 시끄러워지므로 결과만 로그로 남긴다.
exports.regenerate_home_dynamic_on_pin_write = functions.firestore
  .document('home_carousel_pins/{pinId}')
  .onWrite(async (change, context) => {
    const result = await generateHomeDynamic(db);
    console.log(
      'regenerate_home_dynamic_on_pin_write done',
      context.params.pinId,
      result.date,
      result.carousel.length
    );
    return null;
  });

// 어드민에서 '지금 인기/오늘의 발견' 제외 목록(home_dynamic_config/main.exclude)을
// 바꾸면 즉시 홈 편성을 재생성한다 → 뺀 책이 바로 사라지고 빈 자리는 자동 백필.
// (home_dynamic 컬렉션이 아닌 별도 컬렉션이라 current 쓰기로 인한 무한 트리거 없음)
exports.regenerate_home_dynamic_on_config_write = functions.firestore
  .document('home_dynamic_config/{docId}')
  .onWrite(async (change, context) => {
    const result = await generateHomeDynamic(db);
    console.log(
      'regenerate_home_dynamic_on_config_write done',
      context.params.docId,
      result.date,
      result.trending.length,
      result.discover.length
    );
    return null;
  });

// 활성 이벤트 캐시(event_state/active_books)를 수동으로 즉시 재빌드한다.
// 신규 이벤트를 Firebase Console 등 외부에서 생성한 직후, daily_job을 기다리지 않고
// 이 엔드포인트를 호출하면 로그 트리거가 바로 그 이벤트를 인식할 수 있다.
exports.refresh_active_books = functions.https.onRequest(async (req, res) => {
  try {
    await rebuildActiveBooksCache(db, admin);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('refresh_active_books failed', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GA4 DAU/WAU/MAU를 매일 자동 수집해 Firestore(analytics_dau, analytics_meta/dau_latest)에 저장.
// 매일 한국시간(KST) 오전 9시에 실행. 최근 3일치를 다시 가져와 늦게 집계되는 값을 보정한다.
// 수동 1회 실행은 아래 collect_dau_now(HTTPS)로 가능.
exports.collect_dau = functions
  .region('asia-northeast1')
  .pubsub.schedule('every day 09:00')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    try {
      const result = await fetchAndStoreDau(db, { lookbackDays: 3 });
      console.log('collect_dau done', JSON.stringify(result.rows));
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error?.message ?? e.message;
      console.error(`collect_dau failed (status ${status}): ${msg}`);
      throw e;
    }
    return null;
  });

// DAU 수집을 수동으로 1회 실행하는 검증용 HTTPS 트리거. (배포 직후 동작 확인용)
// 쿼리 파라미터: ?days=N (기본 7일, 최대 90일)
exports.collect_dau_now = functions
  .region('asia-northeast1')
  .https.onRequest(async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const opts = (startDate && endDate) ? { startDate, endDate } : { lookbackDays: days };
      const result = await fetchAndStoreDau(db, opts);

      // 날짜별 요약 테이블 (응답 JSON에 포함)
      const summary = result.rows.map((r) => ({
        date: r.date,
        dau: r.dau,
        wau: r.wau,
        mau: r.mau,
        dauPerMau: Number.isFinite(r.dauPerMau) ? `${(r.dauPerMau * 100).toFixed(1)}%` : null,
        dauPerWau: Number.isFinite(r.dauPerWau) ? `${(r.dauPerWau * 100).toFixed(1)}%` : null,
        wauPerMau: Number.isFinite(r.wauPerMau) ? `${(r.wauPerMau * 100).toFixed(1)}%` : null,
        purchaseRevenue: r.purchaseRevenue,
        totalRevenue: r.totalRevenue,
      }));

      res.status(200).json({
        ok: true,
        property: result.property,
        serviceAccount: result.serviceAccount,
        dateRange: (startDate && endDate) ? { startDate, endDate } : { lookbackDays: days },
        count: summary.length,
        rows: summary,
      });
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error?.message ?? e.message;
      console.error(`collect_dau_now failed (status ${status}): ${msg}`);
      res.status(500).json({ ok: false, status, error: msg });
    }
  });

// 매일 KST 09:00(UTC 00:00)에 전날 GA4 지표를 Discord로 발송.
// DISCORD_WEBHOOK_URL 시크릿이 설정되어 있어야 한다: firebase functions:secrets:set DISCORD_WEBHOOK_URL
exports.daily_dau_report = functions
  .runWith({
    timeoutSeconds: 120,
    secrets: [discordWebhook],
  })
  .pubsub.schedule('every day 00:00')
  .timeZone('UTC')
  .onRun(async () => {
    try {
      await sendDauReport(db);
      console.log('daily_dau_report: Discord 전송 완료');
    } catch (e) {
      console.error('daily_dau_report 실패:', e.message);
      throw e;
    }
    return null;
  });

// 매일 KST 20:30에 최근 독서 이력이 있는 토큰 보유 사용자에게 이어읽기 푸시를 보낸다.
// 앱 배포 전/토큰 적재 전에는 tokenCount=0으로 종료된다.
exports.daily_personalized_push = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .pubsub.schedule('every day 20:30')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const result = await sendDailyPersonalizedPush({
      db,
      admin,
      messaging: admin.messaging(),
      dryRun: false,
    });
    console.log('daily_personalized_push done', JSON.stringify(result));
    return null;
  });

// 수동 검증용 엔드포인트. 기본은 dryRun=1이며, 실제 발송은 ?dryRun=0 으로 호출한다.
exports.personalized_push_now = functions.https.onRequest(async (req, res) => {
  try {
    const result = await sendDailyPersonalizedPush({
      db,
      admin,
      messaging: admin.messaging(),
      dryRun: req.query.dryRun !== '0',
    });
    res.status(200).json(result);
  } catch (e) {
    console.error('personalized_push_now failed', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// SEO 용 공개 웹 페이지: hosting rewrite(/book/**, /sitemap.xml)가 이 함수로 연결된다.
// 책 본문은 노출하지 않는다(앱 설치 유도). 상세 로직은 web_book.js 참고.
exports.web_book = functions.https.onRequest(async (req, res) => {
  try {
    await handleWebBook(db, req, res);
  } catch (e) {
    console.error('web_book 렌더 실패:', req.path, e.message);
    res.status(500).send('Internal Server Error');
  }
});

// book_reviews 신규 문서에 created_at 자동 부여.
// 클라이언트(Android/Flutter)는 이 필드를 쓰지 않으므로 서버에서 보완.
exports.stamp_book_review = functions.firestore
  .document('book_reviews/{reviewId}')
  .onCreate((snap) =>
    snap.ref.update({ created_at: admin.firestore.FieldValue.serverTimestamp() })
  );

// GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account.json" firebase emulators:start
