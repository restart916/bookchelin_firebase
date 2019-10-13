// [START functionsimport]
const functions = require('firebase-functions');
// [END functionsimport]
// [START additionalimports]
// Moments library to format dates.
const moment = require('moment');
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

            count_data_by_user[user_uid].start = data_time.toMillis() < count_data_by_user[user_uid].start.toMillis() ? data_time : count_data_by_user[user_uid].start
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
}

update_time_event = async(book_id, read_time, datetime) => {
  // const book_id = '02IEPKaGI0PrgxhfXbkz';
  let docs = await db.collection('time_event').where("book_id", "==", book_id).get();
  for (let doc of docs.docs) {
    console.log('doc.data()', doc.data());
    let data = doc.data()
    if (!('read_history' in data)) {
      data.read_history = [];
    }

    data.read_history.push({'user_uid': '', 'read_time': read_time, 'datetime': datetime});

    let sum = 0;
    for (read_history of data.read_history) {
      sum += read_history.read_time;
    }

    console.log('time', data.event_minute, sum)

    data.remain_time = data.event_minute - sum;
    data.remain_time = data.remain_time < 0 ? 0 : data.remain_time;

    console.log('doc.data()', data);

    // db.collection('time_event').doc(doc).set(data);
    doc.ref.update(data);
  }
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

  const book_id = newValue.book_id;
  await updateReadLog(book_id, newValue.read_time, context.timestamp);

  if ('createdAt' in newValue) {
    return snap;
  }

  return snap.ref.set({
    createdAt: context.timestamp
  }, {merge: true});
});

exports.test = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {


    res.status(200).send('successful');
  });
});

exports.hourly_job = functions.pubsub
  .topic('hourly-tick')
  .onPublish(async (message) => {
  console.log("This job is run every hour!");

  await updateReadLog();
  await updateReadTimeLog();
  await updateSummary();

  return true;
});

exports.minutes_job = functions.pubsub
  .topic('minutes-tick')
  .onPublish(async (message) => {
  console.log("This job is run every minutes! ver0.076");

  return true;
});
