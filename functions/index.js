// [START functionsimport]
const functions = require('firebase-functions');
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
    }
  }

  db.collection('dayly_total_time').doc(today).set({ total_count: count_data });
  db.collection('dayly_total_time_by_user').doc(today).set({
    data: count_data_by_user,
    time: new Date(),
  });
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

    await updateTimeEvent(
      newValue.book_id,
      user_uid,
      newValue.read_time,
      context.timestamp
    );
    await updateLimitEvent(
      newValue.book_id,
      user_uid,
      newValue.read_time,
      context.timestamp
    );

    if ('createdAt' in newValue) {
      return snap;
    }

    return snap.ref.set(
      {
        createdAt: context.timestamp,
      },
      { merge: true }
    );
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

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '1GB',
};

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

exports.daily_job = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB',
    secrets: [discordWebhook], // Discord 알림용 웹훅 URL
  })
  .pubsub.topic('daily-tick')
  .onPublish(async (message) => {
    console.log('This job is run every day!');

    await updateReadLog(); // 하루에 그 책 몇번 읽었는지
    await updateReadTimeLog(); // 하루에 그 책 몇시간 읽었는지 (유저당으로도)
    // await updateSummary();    // 유저 통계용 데이터 삽입
    await updateEventSummary(); // 출판사 통계 데이터
    const curation = await generateHomeDynamic(db); // 동적 홈 편성(트렌딩/발견 + 자동 추천행)
    // 매일 큐레이션 결과를 Discord 로 알림(실패해도 본 로직은 막지 않음).
    await notifyDiscord(formatCurationMessage(curation));

    return true;
  });

exports.hourly_job = functions
  .runWith(runtimeOpts)
  .pubsub.topic('hourly-tick')
  .onPublish(async (message) => {
    console.log('This job is run every hour!');

    return true;
  });

exports.minutes_job = functions.pubsub
  .topic('minutes-tick')
  .onPublish(async (message) => {
    console.log('This job is run every minutes! ver0.076');

    return true;
  });

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

// GA4 DAU/WAU/MAU를 매일 자동 수집해 Firestore(analytics_dau, analytics_meta/dau_latest)에 저장.
// 매일 한국시간(KST) 오전 9시에 실행. 최근 3일치를 다시 가져와 늦게 집계되는 값을 보정한다.
// 매일 자동 수집 비활성화 (아직 미사용). 필요해지면 아래 블록 주석을 해제하고 배포할 것.
// 수동 1회 실행은 아래 collect_dau_now(HTTPS)로 가능.
// exports.collect_dau = functions
//   .region('asia-northeast1')
//   .pubsub.schedule('every day 09:00')
//   .timeZone('Asia/Seoul')
//   .onRun(async () => {
//     try {
//       const result = await fetchAndStoreDau(db, { lookbackDays: 3 });
//       console.log('collect_dau done', JSON.stringify(result.rows));
//     } catch (e) {
//       const status = e?.response?.status;
//       const msg = e?.response?.data?.error?.message ?? e.message;
//       console.error(`collect_dau failed (status ${status}): ${msg}`);
//       throw e;
//     }
//     return null;
//   });

// DAU 수집을 수동으로 1회 실행하는 검증용 HTTPS 트리거. (배포 직후 동작 확인용)
// 쿼리 파라미터: ?days=N (기본 7일, 최대 90일)
exports.collect_dau_now = functions
  .region('asia-northeast1')
  .https.onRequest(async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
      const result = await fetchAndStoreDau(db, { lookbackDays: days });

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
        days,
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

// GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account.json" firebase emulators:start
