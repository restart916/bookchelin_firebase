// analytics_discord.js
// 전날 GA4 지표(DAU/WAU/MAU + 리텐션 비율 + 수익)를 Discord로 발송하는 로직.
// 매일 KST 09:00(UTC 00:00)에 daily_dau_report 스케줄 함수에서 호출된다.

const { fetchAndStoreDau } = require('./analytics_dau');
const { notifyDiscord } = require('./discord');

// UTC 기준 어제 날짜를 YYYYMMDD 문자열로 반환
function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function pct(decimal) {
  if (!Number.isFinite(decimal)) return 'N/A';
  return `${(decimal * 100).toFixed(1)}%`;
}

function usd(amount) {
  if (!Number.isFinite(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

/**
 * GA4에서 전날 데이터를 가져와 Firestore에 저장한 뒤 Discord로 리포트를 발송한다.
 * @param {FirebaseFirestore.Firestore} db
 * @returns {Promise<boolean>} Discord 전송 성공 여부
 */
async function sendDauReport(db) {
  // lookbackDays: 2 → 어제 + 오늘(집계 미완) 두 행을 가져와 Firestore에 저장
  const { rows } = await fetchAndStoreDau(db, { lookbackDays: 2 });

  if (!rows || rows.length === 0) {
    console.warn('[analytics_discord] GA4 응답 행 없음 — Discord 전송 건너뜀');
    return false;
  }

  // UTC 00:00 기준 어제 날짜 행을 우선 선택, 없으면 마지막 행
  const target = yesterdayUTC();
  const row = rows.find((r) => r.date === target) || rows[rows.length - 1];

  const dateLabel = formatDate(row.date);

  const payload = {
    username: '북슐랭 Analytics',
    embeds: [
      {
        title: `📊 ${dateLabel} 일간 리포트`,
        color: 0x5865f2,
        fields: [
          { name: 'DAU', value: String(row.dau), inline: true },
          { name: 'WAU', value: String(row.wau), inline: true },
          { name: 'MAU', value: String(row.mau), inline: true },
          { name: 'DAU/MAU (스티키니스)', value: pct(row.dauPerMau), inline: true },
          { name: 'DAU/WAU', value: pct(row.dauPerWau), inline: true },
          { name: 'WAU/MAU', value: pct(row.wauPerMau), inline: true },
          {
            name: '💰 수익',
            value: `구매: ${usd(row.purchaseRevenue)} · 전체: ${usd(row.totalRevenue)}`,
            inline: false,
          },
        ],
        footer: { text: 'GA4 Property 185590610 · Bookchelin Firebase' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return notifyDiscord(payload);
}

module.exports = { sendDauReport };
