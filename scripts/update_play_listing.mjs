// update_play_listing.mjs — 플레이스토어 등록정보(제목/짧은설명/자세한설명) 업데이트 일회성 스크립트.
// ASO 재정비 (TODO.md) 2026-06-11. 실행: node update_play_listing.mjs [--dry-run]
//
// 서비스 계정이 Play Console에 사용자로 초대되어 있어야 한다 (스토어 등록정보 수정 권한).
// 커밋하면 구글 검토 후 자동 게시된다.

import { GoogleAuth } from 'google-auth-library';

const KEY = './bookchelin-firebase-adminsdk-crofb-8c813abbcb.json';
const PKG = 'com.bookchelin.bookchelin';
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const dryRun = process.argv.includes('--dry-run');

const LISTINGS = {
  'ko-KR': {
    language: 'ko-KR',
    title: '북슐랭 - 회원가입 없는 전자책·도서 어플',
    shortDescription:
      '베스트셀러부터 고전까지 400권+ 전자책을 무료로, 회원가입 없이 바로 읽으세요',
    fullDescription: `■ 북슐랭은 어떤 앱인가요?
회원가입도, 결제도 없이 400권이 넘는 전자책을 무료로 읽을 수 있는 독서 어플입니다. 설치하고 바로 책을 펼치세요.

■ 이런 분께 추천해요
- 전자책 구독료가 부담스러운 분
- 회원가입 없이 가볍게 책을 읽고 싶은 분
- 출퇴근길, 잠들기 전 독서 습관을 만들고 싶은 분
- 해외에서 한국 책을 읽고 싶은 교민·유학생 (한국 결제수단 없어도 OK)
- 아이와 함께 읽을 책을 찾는 부모님

■ 주요 기능
- 무료 전자책 400권+ : 베스트셀러였던 화제작부터 저작권 만료 고전 단편까지
- 카테고리 : 문학 / 지식교양 / 경제경영 / 자기계발 / 키즈 / 취업·수험
- 매일 새로운 책 추천, 지금 인기 있는 책
- 독자 별점과 리뷰를 보고 골라 읽기
- 전자책 뷰어 : 글자 크기·글꼴·테마 설정

■ 어떻게 무료인가요?
북슐랭은 광고 수익으로 운영되며, 무제한 도서에서 발생한 수익은 출판사와 작가에게 100% 전달됩니다. 북슐랭은 출판업의 활성화에 도움이 되고자 최선을 다하고 있습니다.

■ 문의
이메일 : bookchelin@naver.com
블로그 : https://blog.naver.com/bookchelin/221495798522
웹 : https://bookchelin.web.app

■ 콘텐츠 제휴(파트너십)
이메일 : helgi2019@gmail.com`,
  },
  'en-US': {
    language: 'en-US',
    title: 'BookChelin - Korean Books',
    shortDescription:
      'Read 400+ Korean ebooks for free. No sign-up, no subscription.',
    fullDescription: `■ What is BookChelin?
BookChelin is a free reading app with 400+ Korean ebooks. No sign-up, no subscription, no Korean payment method required — install and start reading right away.

■ Perfect for
- Koreans living abroad who miss reading in Korean
- Korean learners who want real Korean books to practice reading
- Anyone who finds ebook subscriptions too expensive
- Parents reading with kids (Korean children's books included)

■ Features
- 400+ Korean ebooks, free: former bestsellers and public-domain Korean classics
- Categories: literature, knowledge & culture, business & economics, self-improvement, kids, exam prep
- Daily book recommendations and trending picks
- Reader ratings and reviews
- Ebook reader with font size, typeface, and theme settings

■ How is it free?
BookChelin is ad-supported. 100% of the revenue from unlimited books goes to publishers and authors, supporting the Korean publishing industry.

■ Contact
Email: bookchelin@naver.com
Web: https://bookchelin.web.app

■ Content partnership
Email: helgi2019@gmail.com`,
  },
};

// 글자수 제한 검증 (구글 정책: 제목 30 / 짧은설명 80 / 자세한설명 4000)
for (const [lang, l] of Object.entries(LISTINGS)) {
  const t = [...l.title].length, s = [...l.shortDescription].length, f = [...l.fullDescription].length;
  console.log(`${lang}: title ${t}/30, short ${s}/80, full ${f}/4000`);
  if (t > 30 || s > 80 || f > 4000) {
    console.error(`❌ ${lang} 글자수 초과 — 중단`);
    process.exit(1);
  }
}
if (dryRun) { console.log('(dry-run — 적용 안 함)'); process.exit(0); }

const auth = new GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();

const { data: edit } = await client.request({ url: `${BASE}/edits`, method: 'POST', data: {} });
console.log('edit:', edit.id);

for (const [lang, listing] of Object.entries(LISTINGS)) {
  await client.request({
    url: `${BASE}/edits/${edit.id}/listings/${lang}`,
    method: 'PUT',
    data: listing,
  });
  console.log(`✅ ${lang} 등록정보 업데이트`);
}

await client.request({ url: `${BASE}/edits/${edit.id}:commit`, method: 'POST' });
console.log('✅ 커밋 완료 — 구글 검토 후 게시됩니다.');
