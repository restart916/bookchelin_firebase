const test = require('node:test');
const assert = require('node:assert');
const { classifyReadTime, ANOMALY_THRESHOLD_SECONDS } = require('./read_time_sanitize');

test('정상 양수는 valid, 비이상치', () => {
  const r = classifyReadTime(120);
  assert.deepStrictEqual(r, { valid: true, value: 120, anomaly: false, reason: 'ok' });
});

test('0초도 valid(비이상치)', () => {
  assert.strictEqual(classifyReadTime(0).valid, true);
  assert.strictEqual(classifyReadTime(0).anomaly, false);
});

test('임계 초과 유한 양수는 valid + anomaly', () => {
  const r = classifyReadTime(ANOMALY_THRESHOLD_SECONDS + 1);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.anomaly, true);
  assert.strictEqual(r.reason, 'over_threshold');
  assert.strictEqual(r.value, ANOMALY_THRESHOLD_SECONDS + 1); // 값 보존(자르지 않음)
});

test('임계 정확히 같은 값은 비이상치', () => {
  assert.strictEqual(classifyReadTime(ANOMALY_THRESHOLD_SECONDS).anomaly, false);
});

test('음수는 corrupt(합산 제외)', () => {
  const r = classifyReadTime(-5);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'corrupt');
});

test('NaN/Infinity/문자열/undefined는 corrupt', () => {
  for (const bad of [NaN, Infinity, -Infinity, '120', undefined, null, {}]) {
    assert.strictEqual(classifyReadTime(bad).valid, false, `${bad} should be corrupt`);
  }
});
