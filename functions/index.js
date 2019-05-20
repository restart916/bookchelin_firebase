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
  for (let doc of docs.docs) {
      // console.log(doc.id, " => ", doc.data())
      let read_info = doc.data();
      let book_id = read_info.book_id;
      if (book_id in count_data) {
        count_data[book_id] += read_info.read_time;
      } else {
        count_data[book_id] = read_info.read_time;
      }
  }

  db.collection('dayly_total_time').doc(today).set({total_count: count_data});
};

exports.hourly_job = functions.pubsub
  .topic('hourly-tick')
  .onPublish(async (message) => {
  console.log("This job is run every hour!");

  await updateReadLog();
  await updateReadTimeLog();

  return true;
});

exports.minutes_job = functions.pubsub
  .topic('minutes-tick')
  .onPublish(async (message) => {
  console.log("This job is run every minutes! ver0.076");
  // if (message.data) {
  //   const dataString = Buffer.from(message.data, 'base64').toString();
  //   console.log(`Message Data: ${dataString}`);
  // }

  return true;
});
