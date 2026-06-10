// 어드민 접근 제어 (구글 로그인 + 이메일 화이트리스트).
// 주의: 이것은 어드민 UI 접근만 막는 게이트다. 데이터 보호는 Firestore 규칙(별도 작업)이 담당한다.
//   - docs/backlog.md "1. 어드민 로그인 게이트 + Firestore 규칙 잠그기" 참고.
// 공개 라우트(외부 CP사 제공용)는 router.js 의 PUBLIC_ROUTE_NAMES 로 예외 처리한다.
// main.js 와의 순환 import 를 피하기 위해 fireauth 를 import 하지 않고
// Firebase 기본 앱의 auth() 를 직접 사용한다(앱 entry(main.js)에서 이미 initializeApp 완료).
import Firebase from 'firebase';

// 어드민으로 허용할 구글 계정. 추가 시 여기에 이메일을 넣으면 된다.
export const ADMIN_EMAILS = [
  'restart916@gmail.com',
];

export function isAdmin(user) {
  return !!user && !!user.email && ADMIN_EMAILS.includes(user.email);
}

// Firebase 는 세션 복원을 비동기로 한다. 라우터 가드는 첫 인증 상태가 확정될 때까지 기다려야 한다.
let _readyPromise = null;
export function onAuthReady() {
  if (!_readyPromise) {
    _readyPromise = new Promise((resolve) => {
      const unsub = Firebase.auth().onAuthStateChanged((user) => {
        unsub();
        resolve(user);
      });
    });
  }
  return _readyPromise;
}

export async function signInWithGoogle() {
  const provider = new Firebase.auth.GoogleAuthProvider();
  const result = await Firebase.auth().signInWithPopup(provider);
  return result.user;
}

export function signOut() {
  return Firebase.auth().signOut();
}
