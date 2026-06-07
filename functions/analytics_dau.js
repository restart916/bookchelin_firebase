// analytics_dau.js
// GA4(Firebase Analytics)의 DAU/WAU/MAU를 조회해 Firestore에 저장하는 로직.
//
// 인증: Cloud Functions 런타임 서비스 계정의 ADC(Application Default Credentials)를 사용한다.
//   - 키 파일을 코드에 포함하지 않는다.
//   - 대신 이 함수의 런타임 서비스 계정을 GA4 속성에 "뷰어"로 추가해야 한다.
//   - 어떤 계정을 추가해야 하는지는 첫 실행 로그(serviceAccount: ...)에서 확인할 수 있다.
//
// GA4 지표: active1DayUsers ≈ DAU, active7DayUsers ≈ WAU, active28DayUsers ≈ MAU

const { GoogleAuth } = require('google-auth-library');

// bookchelin GA4 속성 ID (숫자만). scripts/check_ga4_access.mjs 에서 검증된 값.
const GA4_PROPERTY_ID = '185590610';

// Firestore 저장 위치
const COLLECTION = 'analytics_dau'; // 날짜별 문서: 문서ID = YYYYMMDD
const LATEST_DOC = 'analytics_meta/dau_latest'; // 최신 스냅샷 1건

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});

async function callGa4(client, url, method = 'GET', body) {
  const res = await client.request({ url, method, data: body });
  return res.data;
}

/**
 * GA4에서 최근 N일치 DAU/WAU/MAU를 가져와 Firestore에 upsert 한다.
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} opts
 * @param {number} [opts.lookbackDays=3] 최근 며칠치를 다시 가져와 갱신할지 (늦게 집계되는 데이터 보정용)
 * @returns {Promise<{property:string, serviceAccount:string, rows:Array}>}
 */
async function fetchAndStoreDau(db, opts = {}) {
  const lookbackDays = opts.lookbackDays || 3;

  const client = await auth.getClient();

  // 어떤 서비스 계정으로 인증됐는지 로그로 남긴다 (GA4 뷰어 권한을 줄 대상).
  let serviceAccount = 'unknown';
  try {
    const creds = await auth.getCredentials();
    serviceAccount = creds.client_email || 'unknown';
  } catch (e) {
    // 무시: 일부 환경에서는 getCredentials 가 이메일을 노출하지 않음
  }
  console.log('GA4 DAU job: serviceAccount =', serviceAccount, 'property =', GA4_PROPERTY_ID);

  const data = await callGa4(
    client,
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    'POST',
    {
      dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'active1DayUsers' },
        { name: 'active7DayUsers' },
        { name: 'active28DayUsers' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }
  );

  const rows = (data.rows || []).map((row) => {
    const date = row.dimensionValues[0].value; // YYYYMMDD
    const [dau, wau, mau] = row.metricValues.map((m) => Number(m.value));
    return { date, dau, wau, mau };
  });

  // Firestore에 날짜별 문서로 upsert
  const batch = db.batch();
  for (const r of rows) {
    const ref = db.collection(COLLECTION).doc(r.date);
    batch.set(
      ref,
      {
        date: r.date,
        dau: r.dau,
        wau: r.wau,
        mau: r.mau,
        property: GA4_PROPERTY_ID,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }
  await batch.commit();

  // 최신 스냅샷 (가장 최근 날짜) 별도 저장 → 대시보드/알림에서 1건만 읽으면 됨
  if (rows.length > 0) {
    const latest = rows[rows.length - 1];
    await db.doc(LATEST_DOC).set(
      {
        ...latest,
        property: GA4_PROPERTY_ID,
        serviceAccount,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }

  console.log(`GA4 DAU job: stored ${rows.length} day(s).`, JSON.stringify(rows));
  return { property: GA4_PROPERTY_ID, serviceAccount, rows };
}

module.exports = { fetchAndStoreDau, GA4_PROPERTY_ID, COLLECTION, LATEST_DOC };
