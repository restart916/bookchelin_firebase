// check_ga4_access.mjs
// 서비스 계정 키로 GA4(Firebase Analytics) 접근/DAU·MAU 조회가 가능한지 검증하는 일회성 스크립트.
//
// 실행:
//   cd scripts
//   npm i google-auth-library            # 이미 node_modules에 있으면 생략
//   node check_ga4_access.mjs                       # 접근 가능한 GA4 속성 목록 확인
//   node check_ga4_access.mjs <GA4_PROPERTY_ID>     # 해당 속성의 최근 7일 DAU/MAU 조회
//
// GA4_PROPERTY_ID 는 숫자만 (예: 123456789). Firebase 콘솔이 아니라 GA4 Admin에서 확인.

import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const KEY = './bookchelin-firebase-adminsdk-crofb-8c813abbcb.json';
const propertyId = process.argv[2];

const auth = new GoogleAuth({
  keyFile: KEY,
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});

const client = await auth.getClient();
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
console.log('Service account:', sa.client_email);

async function call(url, method = 'GET', body) {
  const res = await client.request({ url, method, data: body });
  return res.data;
}

try {
  if (!propertyId) {
    // 1) 이 서비스 계정이 볼 수 있는 GA4 속성 목록
    const data = await call(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries'
    );
    const summaries = data.accountSummaries ?? [];
    if (summaries.length === 0) {
      console.log('\n❌ 접근 가능한 GA4 계정/속성이 없음.');
      console.log('   → 이 서비스 계정이 GA4 속성에 사용자로 추가돼 있지 않거나, GA4가 연결돼 있지 않음.');
    } else {
      console.log('\n✅ 접근 가능한 GA4 속성:');
      for (const acc of summaries) {
        console.log(`  account: ${acc.displayName} (${acc.account})`);
        for (const p of acc.propertySummaries ?? []) {
          console.log(`    property: ${p.displayName}  id=${p.property}`);
        }
      }
      console.log('\n위 property id(숫자 부분)로 다시 실행: node check_ga4_access.mjs <id>');
    }
  } else {
    // 2) 실제 DAU/MAU 조회 (active1DayUsers ≈ DAU, active28DayUsers ≈ MAU)
    const data = await call(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      'POST',
      {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'active1DayUsers' },
          { name: 'active7DayUsers' },
          { name: 'active28DayUsers' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }
    );
    console.log('\n✅ DAU/MAU 조회 성공 (최근 7일):');
    console.log('date       DAU(1d)  WAU(7d)  MAU(28d)');
    for (const row of data.rows ?? []) {
      const d = row.dimensionValues[0].value;
      const [dau, wau, mau] = row.metricValues.map((m) => m.value);
      console.log(`${d}  ${dau.padStart(7)}  ${wau.padStart(7)}  ${mau.padStart(8)}`);
    }
  }
} catch (e) {
  const status = e?.response?.status;
  const msg = e?.response?.data?.error?.message ?? e.message;
  console.log(`\n❌ 실패 (status ${status}): ${msg}`);
  if (status === 403) {
    console.log('   → 권한 없음. GA4 속성에 이 서비스 계정을 뷰어로 추가하고,');
    console.log('     GCP에서 "Google Analytics Data API" + "Google Analytics Admin API"를 enable 해야 함.');
  }
}
