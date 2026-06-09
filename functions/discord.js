// Discord 알림 헬퍼 (Slack 알림 대체용)
//
// functions 내 어떤 액션이 끝난 뒤 Discord 채널로 알림을 쏘기 위한 단방향 발신 모듈.
// 봇 토큰/intent 없이 채널 Webhook URL 하나만 사용한다.
//
// Webhook URL 발급: Discord 채널 → 설정 → 연동(Integrations) → 웹훅 → URL 복사.
// URL 안에 채널이 박혀 있으므로 서버ID/채널ID는 따로 필요 없다.
//
// 시크릿 등록(코드에 URL을 박지 않기 위함):
//   firebase functions:secrets:set DISCORD_WEBHOOK_URL
// 그리고 이 시크릿을 쓰는 함수의 .runWith({ secrets: [discordWebhook] }) 에 추가.

const axios = require('axios').default;
const { defineSecret } = require('firebase-functions/params');

const discordWebhook = defineSecret('DISCORD_WEBHOOK_URL');

/**
 * Discord 채널로 메시지를 보낸다.
 * @param {string|object} message 문자열이면 그대로 content 로, 객체면 Discord webhook payload 로 전송.
 *   객체 예: { content, username, embeds: [{ title, description, color, fields }] }
 * @returns {Promise<boolean>} 성공 여부 (실패해도 throw 하지 않고 false 반환 — 알림 실패가 본 로직을 막지 않게)
 */
async function notifyDiscord(message) {
  const url = discordWebhook.value();
  if (!url) {
    console.warn('[discord] DISCORD_WEBHOOK_URL 미설정 — 알림 건너뜀');
    return false;
  }

  const payload = typeof message === 'string' ? { content: message } : message;

  try {
    await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    return true;
  } catch (err) {
    // 알림은 부가 기능이므로 본 로직을 깨지 않도록 삼킨다.
    console.error('[discord] 전송 실패:', err.response?.status, err.response?.data || err.message);
    return false;
  }
}

module.exports = { notifyDiscord, discordWebhook };
