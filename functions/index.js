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

// admin.initializeApp({
//   credential: admin.credential.applicationDefault()
// });

// [END additionalimports]
const db = admin.firestore();

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

  const writeResult = await admin.firestore().collection('messages').add({original: original});
  res.json({result: `Message with ID: ${writeResult.id} added.`});
});

updateReadLog = async () => {
  let today = moment().format('YYYY-MM-DD');
  let docs = await db.collection('read_logs').where("createdAt", ">=", today).get();

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

  db.collection('dayly_total').doc(today).set({total_count: count_data});
};

updateReadTimeLog = async () => {
  let today = moment().format('YYYY-MM-DD');
  let docs = await db.collection('read_time_logs').where("createdAt", ">=", today).get();

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

  db.collection('dayly_total_time').doc(today).set({total_count: count_data});
  db.collection('dayly_total_time_by_user').doc(today).set({
    data: count_data_by_user, time: new Date()
  });
};

function addItem(user_uid, data) {
  return new Promise(resolve => {
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

            count_data_by_user[user_uid].start = data_time.toMillis() < count_data_by_user[user_uid].start.toMillis() ? data_time : count_data_by_user[user_uid].start;
          } else {
            count_data_by_user[user_uid] = {
              start: data_time,
              time: user_read_datas[user_uid]
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

updateTimeEvent = async(book_id, user_uid, read_time, datetime) => {
  // const book_id = '02IEPKaGI0PrgxhfXbkz';
  let docs = await db.collection('time_event').where("book_id", "==", book_id).get();
  for (let doc of docs.docs) {
    // console.log('doc.data()', doc.data());
    let data = doc.data();
    if (!('read_history' in data)) {
      data.read_history = [];
    }

    let exists = false;
    for (let read_history of data.read_history) {
      if (read_history.user_uid === user_uid) {
        read_history.read_time += read_time;
        read_history.datetime.push(datetime);
        exists = true;
      }
    }

    if (!exists) {
      data.read_history.push({'user_uid': user_uid, 'read_time': read_time, 'datetime': [datetime]});
    }

    let sum = 0;
    for (let read_history of data.read_history) {
      sum += read_history.read_time;
    }

    console.log('time', data.event_minute, sum);

    data.remain_time = data.event_minute - sum;
    data.remain_time = data.remain_time < 0 ? 0 : data.remain_time;

    doc.ref.update(data);
  }
};


updateLimitEvent = async(book_id, user_uid, read_time, datetime) => {
  let docs = await db.collection('limit_event').where("book_id", "==", book_id).get();
  for (let doc of docs.docs) {
    let data = doc.data();
    if (!('read_history' in data)) {
      data.read_history = [];
    }

    let exists = false;
    for (let read_history of data.read_history) {
      if (read_history.user_uid === user_uid) {
        read_history.total_time += read_time;
        read_history.logs.push(
          {'read_time': read_time, 'datetime': datetime}
        );
        exists = true;
      }
    }

    if (!exists) {
      data.read_history.push({
        'user_uid': user_uid,
        'logs':[
          {'read_time': read_time, 'datetime': datetime}
        ],
        'total_time': read_time
      });
    }

    doc.ref.update(data);
  }
};

updateEventSummaryByDay = async (start_moment) => {
  let time_datas = await loadEventData('time_event', start_moment);
  let limit_datas = await loadEventData('limit_event', start_moment);

  db.collection('dayly_event_count')
    .doc(start_moment.format('YYYY-MM-DD'))
    .set({'time_datas': time_datas, 'limit_datas': limit_datas});
};

updateEventSummary = async () => {
  const results = [];
  for (let i = 0; i < 2; i++){
    let start_moment = moment().add(-(i), 'days');
    console.log('----------------', i, start_moment)
    results.push(updateEventSummaryByDay(start_moment));
  }
  await Promise.all(results);
};

loadEventUnitData = async (datas, time_event, start_date, end_date) => {
  const event_id = time_event.id;
  const time_event_data = time_event.data();
  datas[event_id] = {'book_id': time_event_data['book_id']};

  const book_data = await db
                          .collection('books')
                          .doc(time_event_data['book_id'])
                          .get();
  datas[event_id]['book_name'] = book_data.data()['title'];

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

  datas[event_id].show_detail_count = show_book_details.docs.length
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

  if (time_event_data.read_history.length && 'event_minute' in time_event_data) {
    let total_read_time = time_event_data['event_minute'] - time_event_data['remain_time'];
    datas[event_id]['total_read_time'] = total_read_time;
    datas[event_id]['avg_user_read_time'] = total_read_time / time_event_data.read_history.length;
  } else if (time_event_data.read_history.length) {
    let total_read_time = 0;
    for (let read_history of time_event_data.read_history) {
      total_read_time += read_history.total_time;
    }
    datas[event_id]['total_read_time'] = total_read_time;
    datas[event_id]['avg_user_read_time'] = total_read_time / time_event_data.read_history.length;
  } else {
    datas[event_id]['total_read_time'] = 0;
    datas[event_id]['avg_user_read_time'] = 0;
  }
  // console.log('total_read_time', datas[event_id]['total_read_time'])
  // console.log('avg_user_read_time', datas[event_id]['avg_user_read_time'])

  const click_share_book_details = await db
                                  .collection('click_share_book_detail')
                                  .where('event_id', '==', event_id)
                                  .where('datetime', '>=', moment(start_date).unix())
                                  .where('datetime', '<', moment(end_date).unix())
                                  .get();

  datas[event_id]['click_share_book_count'] = click_share_book_details.docs.length

  const click_buy_book_details = await db
                                  .collection('click_buy_book_detail')
                                  .where('event_id', '==', event_id)
                                  .where('datetime', '>=', moment(start_date).unix())
                                  .where('datetime', '<', moment(end_date).unix())
                                  .get();

  datas[event_id]['click_buy_book_count'] = click_buy_book_details.docs.length

  const reviews = await db.collection('book_reviews')
                                .where('book_id', '==', time_event_data['book_id'])
                                .get()

  datas[event_id]['review_count'] = reviews.docs.length
  let rating = 0
  for (let review of reviews.docs) {
    rating += review.data()['rating']
  }
  datas[event_id]['average_review'] = reviews.docs.length ? (rating / reviews.docs.length).toFixed(2) : 0
};

loadEventData = async (type, start_moment) => {
  let start_date = moment(start_moment).format('YYYY-MM-DD');
  let end_date = moment(start_moment).add(1,'days').format('YYYY-MM-DD');

  const time_events = await db.collection(type).get();
  // console.log(time_events);

  console.log('----------------', type, start_date, end_date)

  const results = [];
  let datas = {};
  for (let time_event of time_events.docs) {
    results.push(loadEventUnitData(datas, time_event, start_date, end_date))
  }
  await Promise.all(results);

  // console.log(datas)
  return datas
}

exports.addTimeStamp = functions.firestore
  .document('read_logs/{document_id}')
  .onCreate((snap, context) => {

  const newValue = snap.data();

  if ('createdAt' in newValue) return snap;

  return snap.ref.set({
    createdAt: context.timestamp
  }, {merge: true});
});

exports.add_time_read_time_logs = functions.firestore
  .document('read_time_logs/{document_id}')
  .onCreate(async(snap, context) => {

  const newValue = snap.data();

  const user_uid = newValue.user_uid || 'unknown';

  await updateTimeEvent(newValue.book_id, user_uid, newValue.read_time, context.timestamp);
  await updateLimitEvent(newValue.book_id, user_uid, newValue.read_time, context.timestamp);

  if ('createdAt' in newValue) {
    return snap;
  }

  return snap.ref.set({
    createdAt: context.timestamp
  }, {merge: true});
});

exports.test = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {

    await updateEventSummary();   // 출판사 통계 데이터

    res.status(200).send('successful');
  });
});

const runtimeOpts = {
  timeoutSeconds: 300
}

exports.daily_job = functions.runWith(runtimeOpts)
  .pubsub
  .topic('daily-tick')
  .onPublish(async (message) => {
  console.log("This job is run every day!");

  await updateReadLog();    // 하루에 그 책 몇번 읽었는지
  await updateReadTimeLog();    // 하루에 그 책 몇시간 읽었는지 (유저당으로도)
  await updateSummary();    // 유저 통계용 데이터 삽입
  await updateEventSummary();   // 출판사 통계 데이터

  return true;
});

exports.hourly_job = functions.runWith(runtimeOpts)
  .pubsub
  .topic('hourly-tick')
  .onPublish(async (message) => {
  console.log("This job is run every hour!");

  // await updateReadLog();    // 하루에 그 책 몇번 읽었는지
  // await updateReadTimeLog();    // 하루에 그 책 몇시간 읽었는지 (유저당으로도)
  // await updateSummary();    // 유저 통계용 데이터 삽입
  // await updateEventSummary();   // 출판사 통계 데이터

  return true;
});

exports.minutes_job = functions.pubsub
  .topic('minutes-tick')
  .onPublish(async (message) => {
  console.log("This job is run every minutes! ver0.076");

  return true;
});
