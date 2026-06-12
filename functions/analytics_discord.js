// analytics_discord.js
// GA4 지표(DAU/WAU/MAU + 리텐션 비율 + 수익)를 Discord로 발송하는 로직.
// 매일 KST 09:00(UTC 00:00)에 daily_dau_report 스케줄 함수에서 호출된다.
//
// 데이터 기준일은 D-2(그저께). GA4 표준 속성은 당일/전일 데이터가 최대 48시간까지
// 계속 채워져, 09시 시점의 전일치는 미완성(실측: 어떤 날 54 → 다음날 83). D-2 는
// 확정돼 더 이상 변하지 않으므로 "매일 같은 숫자를 두 번 보는" 혼란이 없다.
// GA4 property 시간대 = Asia/Seoul(GMT-9)이라 날짜 경계는 KST 자정 기준.

const { fetchAndStoreDau } = require('./analytics_dau');
const { notifyDiscord } = require('./discord');

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 발송 시각과 무관하게 KST 기준 N일 전 날짜를 YYYYMMDD 로 반환.
// (UTC+9 로 시프트한 뒤 날짜만 취하므로 09시가 아닌 시각에 돌려도 정확)
function dateAgoKST(daysAgo) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - daysAgo);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatDate(yyyymmdd) {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const wd = WEEKDAYS[new Date(`${y}-${m}-${d}T00:00:00Z`).getUTCDay()];
  return `${y}-${m}-${d}(${wd})`;
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
  // lookbackDays: 3 → 그저께(D-2)·어제·오늘 + 여유 1일을 가져와 Firestore에 저장.
  // (그저께 행이 반드시 포함되도록 D-2 보다 하루 더 넓게 조회)
  const { rows } = await fetchAndStoreDau(db, { lookbackDays: 3 });

  if (!rows || rows.length === 0) {
    console.warn('[analytics_discord] GA4 응답 행 없음 — Discord 전송 건너뜀');
    return false;
  }

  // 데이터 기준일 = KST D-2(그저께). 확정돼 더 이상 변하지 않는 값.
  const target = dateAgoKST(2);
  const row = rows.find((r) => r.date === target) || rows[rows.length - 1];

  const isExactTarget = row.date === target;
  const dateLabel = formatDate(row.date);
  const sentLabel = formatDate(dateAgoKST(0)); // 발송일(오늘 KST)

  const payload = {
    username: '북슐랭 Analytics',
    embeds: [
      {
        title: `📊 ${dateLabel} 일간 리포트`,
        description:
          `🗓 **데이터 기준일: ${dateLabel}** — 그저께(D-2) 확정치\n` +
          `발송: ${sentLabel} 오전 9시 (KST)` +
          (isExactTarget ? '' : '\n⚠️ 그저께 데이터가 없어 가장 최근 행으로 대체됨'),
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
        footer: { text: 'GA4 Property 185590610 · Bookchelin Firebase · D-2 확정 기준' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return notifyDiscord(payload);
}

module.exports = { sendDauReport };
