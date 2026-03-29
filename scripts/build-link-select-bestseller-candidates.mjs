/**
 * 교보 통합검색으로 도서 메타를 조회해 link_select 추가용 JSON을 만듭니다.
 * 실행: node scripts/build-link-select-bestseller-candidates.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'data', 'link-select-bestseller-candidates.json');

/** store 주간 베스트(전체) 스냅샷에서 뽑은 국내서·인문·실용 위주 후보 (교재/LP 제외) */
const CANDIDATE_TITLES = [
  '사랑이 있으니 살아집디다',
  '왕과 사는 남자 각본집',
  '괴테는 모든 것을 말했다',
  '완벽한 원시인',
  '인생을 위한 최소한의 생각',
  '부처님 말씀대로 살아보니',
  '나의 완벽한 장례식',
  '부의 자율주행 AI 머니',
  '모순 양귀자',
  '자몽살구클럽 한로로',
  '트라이브즈 세스 고딘',
  '무례한 세상에서 나를 지키는 법',
  '싯다르타 헤르만 헤세',
  '아르테미스 스폐셜 에디션 앤디 위어',
  '마션 스폐셜 에디션 앤디 위어',
  '박태웅의 AI 강의 2026',
  '프로젝트 헤일메리 앤디 위어 2026',
  '프로젝트 헤일메리 강동혁',
  '물고기는 존재하지 않는다',
  '전지적 독자 시점',
];

const EXISTING_TITLES = new Set([
  '2030 축의 전환',
  'HEAT(히트)',
  '공간의 미래',
  '공부란 무엇인가',
  '공부의 본질',
  '공정하다는 착각',
  '귀멸의 칼날. 1',
  '그 환자',
  '그러라 그래',
  '그릿',
  '기분이 태도가 되지 않게',
  '나는 주식 대신 달러를 산다',
  '나의 첫 주식 교과서',
  '나의 하루는 4시 30분에 시작된다',
  '뉴욕주민의 진짜 미국식 주식투자',
  '다산의 마지막 습관',
  '달러구트 꿈 백화점',
  '돈의 심리학',
  '돈의 역사는 되풀이된다',
  '돌이킬 수 없는 약속',
  '디 앤서',
  '똑똑하게 생존하기',
  '마음챙김의 시',
  '마지막 몰입: 나를 넘어서는 힘',
  '메타버스 새로운 기회',
  '문명. 1',
  '미드나잇 라이브러리',
  '미드나잇 선. 1',
  '미드나잇 선. 2',
  '미래의 부',
  '미스터 마켓 2021',
  '믹스(Mix)',
  '바이러스 X',
  '밝은 밤',
  '밤의 숨소리',
  '방구석 미술관',
  '백조와 박쥐',
  '부의 골든타임',
  '부의 시나리오',
  '부자의 그릇',
  '불편한 편의점',
  '블랙 쇼맨과 이름 없는 마을의 살인',
  '빌 게이츠, 기후 재앙을 피하는 법',
  '생각이 너무 많은 서른 살에게',
  '성숙한 어른이 갖춰야 할 좋은 심리 습관',
  '세상의 마지막 기차역',
  '소수몽키의 한 권으로 끝내는 미국주식',
  '신곡(La Divina Commedia)',
  '아들아, 돈 공부해야 한다',
  '아몬드',
  '아버지의 해방일지',
  '악의 마음을 읽는 자들',
  '안녕, 소중한 사람',
  '약속의 땅',
  '어떤 죽음이 삶에게 말했다',
  '어떻게 말해줘야 할까',
  '언어를 디자인하라',
  '역행자',
  '오늘 밤, 세계에서 이 사랑이 사라진다 해도',
  '오은영의 화해',
  '완전한 행복',
  '운의 알고리즘',
  '원씽(The One Thing)',
  '월급쟁이 부자로 은퇴하라',
  '위대한 시크릿',
  '이토록 공부가 재미있어지는 순간',
  '이토록 뜻밖의 뇌과학',
  '인생은 소설이다',
  '작은 별이지만 빛나고 있어',
  '잘될 수밖에 없는 너에게',
  '적당히 가까운 사이',
  '종의 기원',
  '주린이가 가장 알고 싶은 최다질문 TOP 77',
  '진보는 어떻게 몰락하는가',
  '질서 너머',
  '최소한의 이웃',
  '트렌드 코리아 2022',
  '파친코 2',
  '폴리매스',
  '하루를 48시간으로 사는 마법',
  '하버드 회복탄력성 수업',
  '하얼빈',
]);

function curl(url) {
  return execSync(`curl -sS --max-time 25 -A "Mozilla/5.0" ${JSON.stringify(url)}`, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

/** 첫 번째 검색 결과: detail 링크 직전/직후에 오는 data-bid(상품코드) */
function firstResultSidAndBid(html) {
  const m = html.match(/product\.kyobobook\.co\.kr\/detail\/(S[0-9]{12})/);
  if (!m) return { sid: null, bid: null, detailIdx: -1 };
  const sid = m[1];
  const idx = m.index || 0;
  const before = html.slice(Math.max(0, idx - 2500), idx);
  const after = html.slice(idx, idx + 20000);
  const pick = (chunk) =>
    chunk.match(/data-bid="(97[89][0-9]{10})"/) ||
    chunk.match(/data-bid="(480[0-9]{10})"/);
  const hit = pick(after) || pick(before);
  const bid = hit ? hit[1] : null;
  return { sid, bid, detailIdx: idx };
}

function introFromSearchBlock(html, detailIdx) {
  if (detailIdx == null || detailIdx < 0) return '';
  const win = html.slice(Math.max(0, detailIdx - 8000), detailIdx + 12000);
  const sub =
    win.match(/prod_desc[^>]*>([^<]{15,300})/) ||
    win.match(/class="prod_desc"[^>]*>([^<]{15,300})/);
  return sub ? sub[1].replace(/\s+/g, ' ').trim().slice(0, 240) : '';
}

function resolveOne(searchQuery) {
  const url = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(
    searchQuery
  )}&target=total`;
  const html = curl(url);
  const { sid, bid, detailIdx } = firstResultSidAndBid(html);
  if (!sid || !bid) {
    return { searchQuery, error: 'S코드 또는 data-bid 없음', sid, bid };
  }
  const detailUrl = `https://product.kyobobook.co.kr/detail/${sid}`;
  let desc = introFromSearchBlock(html, detailIdx);
  if (!desc) {
    desc = `${searchQuery} — 교보문고 검색 1순위 상품`;
  }
  return {
    searchQuery,
    title_suggestion: searchQuery.split(' ').slice(0, 8).join(' '),
    image_url: `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/${bid}.jpg`,
    link_url: `https://product.kyobobook.co.kr/book/preview/${sid}`,
    detail_url: detailUrl,
    description: desc.slice(0, 300),
    s_code: sid,
    product_code: bid,
  };
}

function main() {
  mkdirSync(join(__dirname, 'output'), { recursive: true });

  const seen = new Set();
  const rows = [];
  const skipped = [];

  for (const t of CANDIDATE_TITLES) {
    const key = t.trim();
    if (EXISTING_TITLES.has(key)) {
      skipped.push({ query: key, reason: '이미 link_select(노출) 제목과 동일' });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    const r = resolveOne(key);
    if (r.error) {
      skipped.push(r);
      continue;
    }
    rows.push({
      title: r.title_suggestion,
      image_url: r.image_url,
      link_url: r.link_url,
      description: r.description,
      detail_url: r.detail_url,
      s_code: r.s_code,
      product_code: r.product_code,
      search_used: r.searchQuery,
    });
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        note: 'link_select 수동 등록용. Firestore: timestamp(unix), category, hidden:false 등은 앱에서 맞춰 넣으세요.',
        source: '교보 통합검색 1순위 + product 상세/검색 스니펫',
        generatedAt: new Date().toISOString(),
        count: rows.length,
        items: rows,
        skipped,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`저장: ${OUT} (성공 ${rows.length}, 스킵 ${skipped.length})`);
}

main();
