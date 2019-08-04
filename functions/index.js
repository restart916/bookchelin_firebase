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
  .onCreate((snap, context) => {

  const newValue = snap.data();

  if ('createdAt' in newValue) return snap;

  return snap.ref.set({
    createdAt: context.timestamp
  }, {merge: true});
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

updateSummary = async () => {
  let docs = await db.collection('dayly_total_time_by_user').get();

  let count_data_by_user = {};
  for (let doc of docs.docs) {
      // console.log(doc.id, " => ", doc.data());
      let user_read_datas = doc.data().data;
      let data_time = doc.data().time;
      // console.log(user_read_datas)

      for (let user_uid in user_read_datas) {
          if (user_uid in count_data_by_user) {
            count_data_by_user[user_uid].time += user_read_datas[user_uid];

            // console.log('diff', data_time, count_data_by_user[user_uid].start)
            count_data_by_user[user_uid].start = data_time < count_data_by_user[user_uid].start ? data_time : count_data_by_user[user_uid].start
          } else {
            count_data_by_user[user_uid] = {
              start: data_time,
              time: user_read_datas[user_uid]
            };
          }
      }
  }

  for (let user_uid in count_data_by_user) {
    let data = count_data_by_user[user_uid];
    db.collection('total_time_by_user').doc(user_uid).set(data);
  }
}

exports.test = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {

    await updateReadTimeLog();
    await updateSummary();
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
