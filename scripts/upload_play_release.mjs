// upload_play_release.mjs — AAB 를 Play 프로덕션 트랙에 업로드·출시.
// 사용법: node upload_play_release.mjs <AAB경로> [--rollout 0.2] [--draft]
//   --rollout 0.2 : 단계적 출시 20% (생략 시 100% 전체 출시)
//   --draft       : 업로드만 하고 출시는 콘솔에서 수동 (draft 상태)
// 서비스 계정이 Play Console 에 "출시 관리" 권한으로 초대되어 있어야 한다.

import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const KEY = './bookchelin-firebase-adminsdk-crofb-8c813abbcb.json';
const PKG = 'com.bookchelin.bookchelin';
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD_BASE = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;

const aabPath = process.argv[2];
if (!aabPath) {
  console.error('사용법: node upload_play_release.mjs <AAB경로> [--rollout 0.2] [--draft]');
  process.exit(1);
}
const rolloutIdx = process.argv.indexOf('--rollout');
const rollout = rolloutIdx > 0 ? parseFloat(process.argv[rolloutIdx + 1]) : null;
const draft = process.argv.includes('--draft');

const RELEASE_NOTES_KO = `• 책 공유 링크 개선: 공유받은 링크를 누르면 앱에서 바로 열려요
• 알림 권한 안내 추가
• 안정성 개선 및 내부 정리`;

const auth = new GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();

// 1) edit 생성
const { data: edit } = await client.request({ url: `${BASE}/edits`, method: 'POST', data: {} });
console.log('edit:', edit.id);

// 2) AAB 업로드
const aab = readFileSync(aabPath);
console.log(`AAB 업로드 중... (${(aab.length / 1024 / 1024).toFixed(1)} MB)`);
const { data: bundle } = await client.request({
  url: `${UPLOAD_BASE}/edits/${edit.id}/bundles?uploadType=media`,
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: aab,
});
console.log('업로드 완료: versionCode', bundle.versionCode);

// 3) 프로덕션 트랙에 릴리즈 설정
const release = {
  versionCodes: [String(bundle.versionCode)],
  status: draft ? 'draft' : rollout ? 'inProgress' : 'completed',
  releaseNotes: [{ language: 'ko-KR', text: RELEASE_NOTES_KO }],
};
if (rollout) release.userFraction = rollout;

await client.request({
  url: `${BASE}/edits/${edit.id}/tracks/production`,
  method: 'PUT',
  data: { track: 'production', releases: [release] },
});
console.log(`프로덕션 트랙 설정: ${release.status}${rollout ? ` (${rollout * 100}%)` : ''}`);

// 4) 커밋 (구글 검토 후 게시)
await client.request({ url: `${BASE}/edits/${edit.id}:commit`, method: 'POST' });
console.log('✅ 커밋 완료 — 구글 검토 후 출시됩니다.');
