// read_time_logs 의 read_time 값 분류기 (순수 함수, 부수효과 없음).
//   valid=false  → 합산에서 제외(손상값). corrupt.
//   anomaly=true → 합산은 하되 로그 + anomaly 마커(거대값, 값은 보존/자르지 않음).
// 정책: 값을 절대 클램프하지 않는다. 손상만 차단, 거대값은 관찰만 한다.

const ANOMALY_THRESHOLD_SECONDS = 3600;

function classifyReadTime(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { valid: false, value: 0, anomaly: false, reason: 'corrupt' };
  }
  if (raw > ANOMALY_THRESHOLD_SECONDS) {
    return { valid: true, value: raw, anomaly: true, reason: 'over_threshold' };
  }
  return { valid: true, value: raw, anomaly: false, reason: 'ok' };
}

module.exports = { classifyReadTime, ANOMALY_THRESHOLD_SECONDS };
