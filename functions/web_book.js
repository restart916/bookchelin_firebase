// 검색엔진 노출용(SEO/AEO) 공개 웹 페이지 렌더러.
//  - GET /            : 앱 소개 랜딩 (인기 책 그리드 + 스토어 배지 + FAQ)
//  - GET /book/{bookId} : 책 소개 SSR 페이지 (표지/소개/목차/리뷰 + 앱 스토어 유도)
//  - GET /sitemap.xml   : 공개(hidden=false) 책 전체 사이트맵
// 어드민 SPA 는 /admin/ 정적 경로로 서빙된다 (firebase.json rewrites 참고).
// 정책: 책 본문(전문)은 절대 웹에 노출하지 않는다 — 읽기는 앱 설치로 유도한다.
// iOS 는 Smart App Banner(apple-itunes-app)가 설치 시 "열기", 미설치 시 App Store 로 안내.
// Android 는 Play 스토어 페이지가 설치 시 "열기" 버튼을 보여준다.

const WEB_BASE_URL = 'https://bookchelin.web.app';
const IOS_APP_ID = '1544648278';
const IOS_STORE_URL = `https://apps.apple.com/kr/app/id${IOS_APP_ID}`;
const ANDROID_PACKAGE = 'com.bookchelin.bookchelin';
const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

const CATEGORY_NAMES = {
  1: '지식교양',
  2: '자기계발',
  3: '취업수험',
  4: '키즈',
  5: '문학',
  6: '경제경영',
};

const escapeHtml = (v) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2br = (escaped) => escaped.replace(/\n/g, '<br>');

const truncate = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function loadReviews(db, bookId) {
  const snap = await db
    .collection('book_reviews')
    .where('book_id', '==', bookId)
    .limit(200)
    .get();
  let sum = 0;
  let count = 0;
  const texts = [];
  snap.forEach((d) => {
    const r = d.data();
    if (r.hide === '1') return; // 도배/숨김 리뷰는 평점 집계·노출 모두에서 제외 (클라이언트와 동일 규약)
    if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) {
      sum += r.rating;
      count += 1;
    }
    if (typeof r.review === 'string' && r.review.trim().length > 1) {
      texts.push({
        rating: r.rating,
        review: r.review.trim(),
        user_name: r.user_name || '',
      });
    }
  });
  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    texts: texts.slice(0, 5),
  };
}

function renderBookHtml(bookId, book, reviews) {
  const title = escapeHtml(book.title);
  const canonical = `${WEB_BASE_URL}/book/${bookId}`;
  const categoryName = CATEGORY_NAMES[Number(book.category)] || '';
  const metaDescription = escapeHtml(
    truncate(book.description, 155) ||
      `${book.title} — 무료 독서 앱 북슐랭에서 읽을 수 있는 책입니다.`
  );
  const image = typeof book.image_url === 'string' ? book.image_url : '';
  const pageTitle = `${title} | 무료 독서 앱 북슐랭`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    description: truncate(book.description, 300),
    url: canonical,
    bookFormat: 'https://schema.org/EBook',
    inLanguage: 'ko',
    isAccessibleForFree: true,
    ...(image ? { image } : {}),
    ...(categoryName ? { genre: categoryName } : {}),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KRW',
      availability: 'https://schema.org/InStock',
    },
    ...(reviews.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: reviews.average,
            ratingCount: reviews.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  // 검색결과에 "북슐랭 > 책 제목" 경로를 노출 (BreadcrumbList).
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '북슐랭', item: WEB_BASE_URL },
      { '@type': 'ListItem', position: 2, name: book.title, item: canonical },
    ],
  };

  const ratingBlock =
    reviews.count > 0
      ? `<p class="rating">★ ${reviews.average} <span class="muted">(리뷰 ${reviews.count}개)</span></p>`
      : '';

  const reviewBlock = reviews.texts.length
    ? `<section class="reviews"><h2>독자 리뷰</h2>${reviews.texts
        .map(
          (r) =>
            `<blockquote><p>${escapeHtml(truncate(r.review, 120))}</p>` +
            `<footer>${'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating || 0))))}` +
            `${r.user_name ? ` — ${escapeHtml(truncate(r.user_name, 20))}` : ''}</footer></blockquote>`
        )
        .join('')}</section>`
    : '';

  const tocBlock =
    typeof book.toc === 'string' && book.toc.trim()
      ? `<section><h2>목차</h2><p class="toc">${nl2br(escapeHtml(book.toc.trim()))}</p></section>`
      : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${metaDescription}">
<link rel="canonical" href="${canonical}">
<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}, app-argument=${canonical}">
<meta property="og:type" content="book">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${metaDescription}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify([jsonLd, breadcrumb])}</script>
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; margin: 0; color: #222; line-height: 1.7; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 16px 20px 120px; }
  header a { color: #d23669; text-decoration: none; font-weight: 700; letter-spacing: 0.06em; }
  .cover { display: block; width: 200px; max-width: 60%; margin: 24px auto 16px; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
  h1 { font-size: 1.5em; text-align: center; margin: 8px 0 4px; }
  .chip { display: block; text-align: center; color: #888; font-size: 0.9em; margin-bottom: 8px; }
  .rating { text-align: center; color: #e8a000; font-weight: 700; }
  .muted { color: #999; font-weight: 400; }
  h2 { font-size: 1.05em; border-left: 4px solid #d23669; padding-left: 10px; margin-top: 36px; }
  .toc { color: #555; }
  blockquote { margin: 14px 0; padding: 10px 14px; background: #f7f7f8; border-radius: 8px; }
  blockquote p { margin: 0 0 6px; }
  blockquote footer { color: #e8a000; font-size: 0.85em; }
  .cta { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #eee; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); text-align: center; }
  .cta p { margin: 0 0 8px; font-size: 0.92em; color: #555; }
  .cta a { display: inline-block; margin: 0 6px; padding: 10px 18px; border-radius: 24px; background: #d23669; color: #fff; text-decoration: none; font-weight: 700; font-size: 0.95em; }
  .cta a.android { background: #01875f; }
  footer.page { margin-top: 48px; color: #aaa; font-size: 0.8em; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header><a href="${WEB_BASE_URL}/">북슐랭</a></header>
  <main>
    ${image ? `<img class="cover" src="${escapeHtml(image)}" alt="${title} 표지" referrerpolicy="no-referrer">` : ''}
    <h1>${title}</h1>
    ${categoryName ? `<span class="chip">${escapeHtml(categoryName)} · 전자책 · 무료</span>` : ''}
    ${ratingBlock}
    <section><h2>책 소개</h2><p>${nl2br(escapeHtml(String(book.description || '').trim()))}</p></section>
    ${tocBlock}
    ${reviewBlock}
  </main>
  <footer class="page">ⓒ 북슐랭 (Bookchelin) — 무제한 무료 독서 앱</footer>
</div>
<div class="cta">
  <p><strong>${title}</strong> 전체 내용은 북슐랭 앱에서 무료로 읽을 수 있어요</p>
  <a id="open-app" class="android" href="#">앱에서 열기</a>
  <a id="store-ios" href="${IOS_STORE_URL}">App Store</a>
  <a id="store-android" class="android" href="${ANDROID_STORE_URL}">Google Play</a>
</div>
<script>
  // App Links/Universal Links 는 카카오톡·인스타 등 인앱 브라우저에서 무시되므로,
  // 그때도 "앱으로 직행"이 되도록 OS 별 폴백을 제공한다.
  // - Android: intent:// URL 이 인앱 브라우저에서도 앱(설치 시)을 열고, 없으면 스토어로 폴백.
  // - iOS: 인앱 웹뷰에선 Universal Link 가 안 통해 App Store 로 안내(Safari 는 상단 Smart App Banner 가 처리).
  (function () {
    var ua = navigator.userAgent || '';
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var openApp = document.getElementById('open-app');
    var storeIos = document.getElementById('store-ios');
    var storeAndroid = document.getElementById('store-android');
    if (isAndroid) {
      var fallback = encodeURIComponent('${ANDROID_STORE_URL}');
      openApp.setAttribute(
        'href',
        'intent://bookchelin.web.app/book/${bookId}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=' +
          fallback + ';end'
      );
      storeIos.style.display = 'none';
      storeAndroid.style.display = 'none';
    } else if (isIOS) {
      // "앱에서 열기" 하나로 통합 (App Store 버튼 제거).
      // 커스텀 스킴(bookchelin://)으로 앱을 직접 연다 — 카카오톡·인스타 인앱 브라우저에서도
      // 동작(Universal Link 는 인앱 웹뷰에서 막힘). 앱이 열리면 탭이 백그라운드로 가고,
      // 안 가면(미설치) App Store 로 폴백. Safari 사용자는 상단 Smart App Banner 가
      // 모달 없이 책 상세로 직행하므로 이 버튼은 주로 인앱 브라우저용.
      // ※ iOS 특성상 미설치 시 커스텀 스킴 호출에서 시스템 모달이 한 번 뜨는 건 불가피
      //   (iframe 우회는 최신 iOS 에서 설치자도 앱이 안 열리는 부작용이 있어 쓰지 않음).
      storeIos.style.display = 'none';
      storeAndroid.style.display = 'none';
      openApp.addEventListener('click', function (e) {
        e.preventDefault();
        var jumped = false;
        var onHide = function () {
          if (document.hidden) jumped = true;
        };
        document.addEventListener('visibilitychange', onHide);
        setTimeout(function () {
          document.removeEventListener('visibilitychange', onHide);
          if (!jumped && !document.hidden) {
            window.location.href = '${IOS_STORE_URL}';
          }
        }, 1500);
        window.location.href = 'bookchelin://book/${bookId}';
      });
    } else {
      // 데스크톱 등: 앱 열기 버튼 숨기고 양쪽 스토어 안내.
      openApp.style.display = 'none';
    }
  })();
</script>
</body>
</html>`;
}

async function loadFeaturedBooks(db) {
  // 홈 큐레이션(home_dynamic/current)의 trending + discover 책을 랜딩 그리드로 재활용
  const ids = [];
  try {
    const cur = await db.doc('home_dynamic/current').get();
    if (cur.exists) {
      const v = cur.data();
      (Array.isArray(v.trending) ? v.trending : []).forEach((t) => {
        if (t && typeof t.book_id === 'string') ids.push(t.book_id);
      });
      (Array.isArray(v.discover) ? v.discover : []).forEach((d) => {
        if (typeof d === 'string') ids.push(d);
      });
    }
  } catch (e) {
    console.warn('loadFeaturedBooks: home_dynamic 읽기 실패', e.message);
  }
  const uniq = [...new Set(ids)].slice(0, 18);
  if (!uniq.length) return [];
  const refs = uniq.map((id) => db.collection('books').doc(id));
  const snaps = await db.getAll(...refs);
  return snaps
    .filter((s) => s.exists && s.data().hidden !== true)
    .slice(0, 12)
    .map((s) => ({ id: s.id, ...s.data() }));
}

// 랜딩 하단 "이런 책도 있어요" — 공개 책을 카테고리별로 묶어 접이식으로 보여준다.
// 카테고리별 모든 공개 책에 내부 링크를 건다(접힌 <details> 안이라 화면 영향은 거의 없음).
// sitemap 외에 크롤러가 모든 책 페이지를 발견할 경로를 보장하는 게 목적.
const CATEGORY_DISPLAY_ORDER = [5, 1, 6, 2, 4, 3]; // 문학·지식교양·경제경영·자기계발·키즈·취업수험

async function loadCatalog(db) {
  // 공개 책 전체를 한 번에 읽어 count 와 카테고리 그룹 양쪽에 재사용 (응답은 12h 캐시됨).
  const snap = await db.collection('books').where('hidden', '==', false).get();
  const byCategory = {};
  snap.forEach((d) => {
    const b = d.data();
    const cat = Number(b.category);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ id: d.id, title: typeof b.title === 'string' ? b.title : '' });
  });
  return { count: snap.size, byCategory };
}

const LANDING_FAQ = [
  {
    q: '북슐랭은 정말 무료인가요?',
    a: '네. 북슐랭의 모든 책은 무료로 제한 없이 읽을 수 있는 무제한 무료 독서 앱입니다.',
  },
  {
    q: '어떤 책을 읽을 수 있나요?',
    a: '문학, 지식교양, 경제경영, 자기계발, 키즈, 취업수험 6개 카테고리의 전자책 400여 권을 제공하며, 운수 좋은 날·메밀꽃 필 무렵 같은 한국 단편소설 고전도 읽을 수 있습니다.',
  },
  {
    q: '어디에서 다운로드하나요?',
    a: 'iPhone은 App Store, Android는 Google Play에서 "북슐랭"을 검색해 무료로 설치할 수 있습니다.',
  },
];

async function renderLanding(db, res) {
  const [featured, catalog] = await Promise.all([
    loadFeaturedBooks(db),
    loadCatalog(db),
  ]);
  const bookCount = catalog.count;
  const featuredIds = new Set(featured.map((b) => b.id));

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'MobileApplication',
      name: '북슐랭',
      operatingSystem: 'iOS, Android',
      applicationCategory: 'BookApplication',
      description: `무제한 무료 독서 앱 북슐랭. 문학·지식교양·경제경영 등 전자책 ${bookCount}권을 무료로 읽을 수 있습니다.`,
      url: WEB_BASE_URL,
      installUrl: IOS_STORE_URL,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: LANDING_FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  const grid = featured
    .map(
      (b) =>
        `<a class="card" href="/book/${b.id}">` +
        (typeof b.image_url === 'string' && b.image_url
          ? `<img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.title)} 표지" loading="lazy" referrerpolicy="no-referrer">`
          : '') +
        `<span>${escapeHtml(truncate(b.title, 22))}</span></a>`
    )
    .join('');

  const faqHtml = LANDING_FAQ.map(
    (f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`
  ).join('');

  // 카테고리별 접이식 목록 (인기 캐러셀에 든 책은 제외)
  const catalogHtml = CATEGORY_DISPLAY_ORDER.filter((c) => catalog.byCategory[c])
    .map((c) => {
      const all = catalog.byCategory[c].filter((b) => !featuredIds.has(b.id));
      if (!all.length) return '';
      const links = all
        .map((b) => `<a href="/book/${b.id}">${escapeHtml(truncate(b.title, 30))}</a>`)
        .join('');
      return `<details><summary>${escapeHtml(CATEGORY_NAMES[c] || '기타')} <span class="cnt">${all.length}권</span></summary><div class="titlelist">${links}</div></details>`;
    })
    .join('');

  const metaDescription = `무제한 무료 독서 앱 북슐랭. 문학·지식교양·경제경영·자기계발·키즈 전자책 ${bookCount}권을 무료로 끝까지 읽을 수 있어요.`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>북슐랭 — 무제한 무료 독서 앱 | 전자책 ${bookCount}권 무료</title>
<meta name="description" content="${escapeHtml(metaDescription)}">
<link rel="canonical" href="${WEB_BASE_URL}/">
<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">
<meta property="og:type" content="website">
<meta property="og:title" content="북슐랭 — 무제한 무료 독서 앱">
<meta property="og:description" content="${escapeHtml(metaDescription)}">
<meta property="og:url" content="${WEB_BASE_URL}/">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; margin: 0; color: #222; line-height: 1.7; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 16px 20px 60px; }
  .hero { text-align: center; padding: 48px 0 32px; }
  .hero h1 { font-size: 2em; margin: 0 0 8px; color: #d23669; }
  .hero p { color: #555; margin: 0 0 24px; }
  .stores a { display: inline-block; margin: 0 6px; padding: 12px 22px; border-radius: 26px; background: #d23669; color: #fff; text-decoration: none; font-weight: 700; }
  .stores a.android { background: #01875f; }
  h2 { font-size: 1.15em; border-left: 4px solid #d23669; padding-left: 10px; margin-top: 44px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 14px; }
  .card { text-decoration: none; color: #333; font-size: 0.82em; line-height: 1.4; }
  .card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); margin-bottom: 6px; }
  .card span { display: block; }
  details { border-bottom: 1px solid #eee; padding: 10px 0; }
  summary { cursor: pointer; font-weight: 600; }
  details p { color: #555; }
  summary .cnt { color: #d23669; font-weight: 400; font-size: 0.85em; margin-left: 4px; }
  .titlelist { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; }
  .titlelist a { color: #555; text-decoration: none; font-size: 0.88em; }
  .titlelist a:hover { color: #d23669; text-decoration: underline; }
  .more { display: inline-block; margin-top: 8px; color: #aaa; font-size: 0.82em; }
  footer { margin-top: 48px; color: #aaa; font-size: 0.8em; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>북슐랭</h1>
    <p>문학부터 경제경영까지, 전자책 ${bookCount}권을 무료로 —<br>무제한 무료 독서 앱</p>
    <div class="stores">
      <a href="${IOS_STORE_URL}">App Store</a>
      <a class="android" href="${ANDROID_STORE_URL}">Google Play</a>
    </div>
  </div>
  ${grid ? `<h2>지금 인기 있는 책</h2><div class="grid">${grid}</div>` : ''}
  ${catalogHtml ? `<h2>이런 책들도 있어요</h2>${catalogHtml}` : ''}
  <h2>자주 묻는 질문</h2>
  ${faqHtml}
  <footer>ⓒ 북슐랭 (Bookchelin) — 무제한 무료 독서 앱</footer>
</div>
</body>
</html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600, s-maxage=43200');
  res.status(200).send(html);
}

function render404() {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>책을 찾을 수 없습니다 | 북슐랭</title><meta name="robots" content="noindex"></head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px;">
<h1>책을 찾을 수 없습니다</h1>
<p>주소가 바뀌었거나 비공개된 책입니다.</p>
<p><a href="${IOS_STORE_URL}">App Store</a> · <a href="${ANDROID_STORE_URL}">Google Play</a>에서 북슐랭을 만나보세요.</p>
</body></html>`;
}

// 개인정보 처리방침 — App Store/Play 스토어 등록에 필요한 공개 정책 페이지.
// 시행일 2019-04-01. 내용 변경 시 이 함수의 본문을 직접 수정한다.
function renderPrivacyHtml() {
  const canonical = `${WEB_BASE_URL}/privacy`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>개인정보 처리방침 | 북슐랭</title>
<meta name="description" content="북슐랭(Bookchelin) 개인정보 처리방침 — 수집 항목, 이용 목적, 보유기간, 정보주체의 권리 및 보호책임자 안내.">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="개인정보 처리방침 | 북슐랭">
<meta property="og:url" content="${canonical}">
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; margin: 0; color: #222; line-height: 1.7; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 16px 20px 80px; }
  header a { color: #d23669; text-decoration: none; font-weight: 700; letter-spacing: 0.06em; }
  h1 { font-size: 1.6em; margin: 20px 0 4px; }
  .effective { color: #888; font-size: 0.9em; margin: 0 0 24px; }
  .lead { color: #444; }
  h2 { font-size: 1.08em; border-left: 4px solid #d23669; padding-left: 10px; margin-top: 36px; }
  ul, ol { padding-left: 1.3em; }
  li { margin: 4px 0; }
  .box { background: #f7f7f8; border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; margin: 14px 0; }
  a { color: #d23669; }
  footer.page { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; color: #aaa; font-size: 0.82em; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header><a href="${WEB_BASE_URL}/">북슐랭</a></header>
  <h1>개인정보 처리방침</h1>
  <p class="effective">본 방침은 2019년 4월 1일부터 시행됩니다.</p>

  <p class="lead">북슐랭은 앱 서비스를 제공함에 있어 개인정보보호법에 따라 이용자의 개인정보 보호 및 권익을 보호하고 개인정보와 관련한 이용자의 고충을 원활하게 처리할 수 있도록 다음과 같은 처리방침을 두고 있습니다. 북슐랭은 개인정보처리방침을 개정하는 경우 앱 화면 및 공식 SNS를 통하여 공지할 것입니다.</p>

  <h2>1. 개인정보의 처리 목적</h2>
  <p>북슐랭은 개인정보를 다음의 목적을 위해 처리합니다. 처리한 개인정보는 다음의 목적 이외의 용도로는 사용되지 않으며 이용 목적이 변경될 시에는 사전동의를 구할 예정입니다.</p>
  <ul>
    <li>가. 이용자의 식별</li>
    <li>나. 다양한 서비스 제공, 문의사항 또는 불만 처리, 공지사항 전달</li>
    <li>다. 서비스 이용 기록과 접속 빈도 분석, 서비스 이용에 대한 통계, 맞춤형 서비스 제공, 서비스 개선에 활용</li>
  </ul>

  <h2>2. 개인정보처리 위탁</h2>
  <p>① 북슐랭은 개인정보 처리업무를 위탁하지 않고 있습니다.<br>② 개인정보처리의 위탁 처리가 발생할 경우에는 지체 없이 본 개인정보 처리방침을 통하여 공개하도록 하겠습니다.</p>

  <h2>3. 정보주체의 권리, 의무 및 그 행사방법</h2>
  <p>이용자는 개인정보주체로서 다음과 같은 권리를 행사할 수 있습니다.</p>
  <p>① 정보주체는 북슐랭에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.</p>
  <ol>
    <li>개인정보 열람요구</li>
    <li>오류 등이 있을 경우 정정 요구</li>
    <li>삭제요구</li>
    <li>처리정지 요구</li>
  </ol>
  <p>② 제1항에 따른 권리 행사는 북슐랭에 대해 개인정보 보호법 시행규칙 별지 제8호 서식에 따라 서면, 전자우편, 모사전송(FAX) 등을 통하여 하실 수 있으며 북슐랭은 이에 대해 지체 없이 조치하겠습니다.<br>③ 정보주체가 개인정보의 오류 등에 대한 정정 또는 삭제를 요구한 경우에는 북슐랭은 정정 또는 삭제를 완료할 때까지 당해 개인정보를 이용하거나 제공하지 않습니다.<br>④ 제1항에 따른 권리 행사는 정보주체의 법정대리인이나 위임을 받은 자 등 대리인을 통하여 하실 수 있습니다. 이 경우 개인정보 보호법 시행규칙 별지 제11호 서식에 따른 위임장을 제출하셔야 합니다.</p>

  <h2>4. 처리하는 개인정보의 항목 및 수집 방법</h2>
  <p>① 북슐랭은 다음의 개인정보 항목을 처리하고 있습니다.</p>
  <ul>
    <li><strong>필수항목</strong> : 단말기 정보(하드웨어 모델, 운영체제 버전), 로그 정보(이용자 식별 코드, 서비스 이용 기록, 설정 내용 등)</li>
    <li><strong>수집목적</strong> : 회원과 비회원의 접속 빈도나 방문 시간 등을 분석, 이용자의 취향과 관심분야를 파악 및 자취 추적, 각종 이벤트 참여 정도 및 방문 회수 파악 등을 통한 타겟 마케팅 및 개인 맞춤 서비스 제공</li>
  </ul>
  <p>② 수집 방법</p>
  <ul>
    <li>앱 다운로드 후 최초 실행 시, 네트워크 접속 시, 쿠키 구매 및 서비스 내 아이템 구매 시 수집</li>
    <li>제휴 관계의 플랫폼 이용 시 별도 동의 절차를 통해 수집</li>
    <li>사용 중 고객 응대 시, 이용자의 자발적 제공 또는 필요에 의해 요청 후 수집</li>
  </ul>

  <h2>5. 개인정보 자동 수집 장치의 설치·운영 및 거부</h2>
  <p>① 이용자가 서비스에 접속하거나 이용할 때, 이용자에 관한 아래 사항을 포함하는 정보를 자동적으로 수집합니다.</p>
  <ul><li>이용내역정보, 로그 정보, 하드웨어 정보</li></ul>
  <p>② 광고 게재 및 효과 측정을 위해 타사 모듈을 탑재하여 방문자 데이터를 수집하고 있으며, 개인 식별이 불가능한 형태의 단말기 정보를 이용 및 제공하고 있습니다.<br>③ Google Analytics를 활용하여 이용자의 서비스 이용에 대해 분석합니다. 이 때 개별 이용자의 개인 정보를 식별하지 않고 익명의 사용자 정보를 활용합니다.<br>④ 이용자는 '광고 식별자 수집 거부' 혹은 '앱 삭제'를 통해 자동 수집 장치의 설치·운영을 거부할 수 있습니다. 귀하는 쿠키 설치에 대한 선택권을 가지고 있습니다. 따라서, 귀하는 웹브라우저에서 옵션을 설정함으로써 모든 쿠키를 허용하거나, 쿠키가 저장될 때마다 확인을 거치거나, 아니면 모든 쿠키의 저장을 거부할 수도 있습니다.</p>
  <div class="box"><strong>■ 광고 식별자 수집 거부 방법</strong><ul style="margin:8px 0 0;"><li>Android : [설정 → Google → 광고] 에서 선택 해제</li><li>iOS : [설정 → 개인정보 보호 → 추적(광고)]</li></ul></div>

  <h2>6. 개인정보의 처리 및 보유기간</h2>
  <p>① 북슐랭은 법령에 따른 개인정보 보유·이용기간 또는 이용자로부터 개인정보 수집 시 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.<br>② 각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.</p>
  <p><strong>1. 앱 설치 및 이용 : 앱 탈퇴 시까지</strong><br>다만, 다음의 사유에 해당하는 경우에는 해당 사유 종료시까지</p>
  <ol>
    <li>관계 법령 위반에 따른 수사·조사 등이 진행중인 경우에는 해당 수사·조사 종료시까지</li>
    <li>앱 이용에 따른 채권·채무관계 잔존시에는 해당 채권·채무관계 정산시까지</li>
  </ol>
  <p><strong>2. 재화 또는 서비스 제공 : 재화·서비스 공급완료 및 요금결제·정산 완료시까지</strong><br>다만, 다음의 사유에 해당하는 경우에는 해당 기간 종료시까지</p>
  <ol>
    <li>「전자상거래 등에서의 소비자 보호에 관한 법률」에 따른 표시·광고, 계약내용 및 이행 등 거래에 관한 기록
      <ul>
        <li>표시·광고에 관한 기록 : 6월</li>
        <li>계약 또는 청약철회, 대금결제, 재화 등의 공급기록 : 5년</li>
        <li>소비자 불만 또는 분쟁처리에 관한 기록 : 3년</li>
      </ul>
    </li>
    <li>「통신비밀보호법」 제41조에 따른 통신사실확인자료 보관
      <ul>
        <li>가입자 전기통신일시, 개시·종료시간, 상대방 가입자번호, 사용도수 : 1년</li>
        <li>컴퓨터통신, 인터넷 로그기록자료, 접속지 추적자료 : 3개월</li>
      </ul>
    </li>
  </ol>

  <h2>7. 개인정보의 파기</h2>
  <p>북슐랭은 원칙적으로 개인정보 처리 목적이 달성된 경우에는 지체 없이 해당 개인정보를 파기합니다. 파기의 절차, 기한 및 방법은 다음과 같습니다.</p>
  <p>① 파기절차<br>이용자가 입력한 정보는 목적 달성 후 별도의 DB에 옮겨져 내부 방침 및 기타 관련 법령에 따라 일정기간 저장된 후 혹은 즉시 파기됩니다. 이 때, DB로 옮겨진 개인정보는 법률에 의한 경우가 아니고서는 다른 목적으로 이용되지 않습니다.<br>② 파기 기한<br>이용자의 개인정보는 개인정보의 보유기간이 경과된 경우에는 보유기간의 종료일로부터 5일 이내에, 개인정보의 처리 목적 달성, 해당 서비스의 폐지, 사업의 종료 등 그 개인정보가 불필요하게 되었을 때에는 개인정보의 처리가 불필요한 것으로 인정되는 날로부터 5일 이내에 그 개인정보를 파기합니다.<br>③ 파기방법<br>전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용합니다.</p>

  <h2>8. 개인정보의 안전성 확보 조치</h2>
  <p>북슐랭은 개인정보보호법 제29조에 따라 다음과 같이 안전성 확보에 필요한 기술적/관리적 및 물리적 조치를 하고 있습니다.</p>
  <p>① 개인정보 취급 직원의 최소화 및 교육<br>개인정보를 취급하는 직원을 지정하고 담당자에 한정시켜 최소화 하여 개인정보를 관리하는 대책을 시행하고 있습니다.<br>② 개인정보에 대한 접근 제한<br>개인정보를 처리하는 데이터베이스시스템에 대한 접근 권한의 부여, 변경, 말소를 통하여 개인정보에 대한 접근통제를 위하여 필요한 조치를 하고 있으며 침입차단시스템을 이용하여 외부로부터의 무단 접근을 통제하고 있습니다.<br>③ 문서 보안을 위한 잠금 장치 사용<br>개인정보가 포함된 서류, 보조저장매체 등을 잠금 장치가 있는 안전한 장소에 보관하고 있습니다.</p>

  <h2>9. 개인정보 보호책임자</h2>
  <p>① 북슐랭은 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.<br>② 정보주체는 북슐랭의 서비스(또는 사업)을 이용하시면서 발생한 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등에 관한 사항을 개인정보 보호책임자 및 담당부서로 문의하실 수 있습니다. 북슐랭은 정보주체의 문의에 대해 지체 없이 답변 및 처리해드릴 것입니다.<br>③ 정보주체는 개인정보 보호법 제35조에 따른 개인정보의 열람 청구를 아래의 연락처로 할 수 있습니다.</p>
  <div class="box"><strong>▶ 개인정보 보호책임자 및 열람 청구 접수·처리</strong><br>성명 : 김주현<br>전화 : 010-3295-1231<br>이메일 : <a href="mailto:bookchelin@naver.com">bookchelin@naver.com</a></div>

  <h2>10. 개인정보 열람 청구</h2>
  <p>북슐랭의 자체적인 개인정보 불만처리, 피해구제 결과에 만족하지 못 하시거나 보다 자세한 도움이 필요하시면 아래의 기관으로 문의하여 주시기 바랍니다.</p>
  <div class="box"><strong>▶ 개인정보 침해신고센터 (한국인터넷진흥원 운영)</strong><br>소관업무 : 개인정보 침해 사실 신고, 상담 신청<br>홈페이지 : <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener">privacy.kisa.or.kr</a><br>전화 : (국번없이) 118</div>
  <div class="box"><strong>▶ 개인정보 분쟁조정위원회 (한국인터넷진흥원 운영)</strong><br>소관업무 : 개인정보 분쟁조정신청, 집단분쟁조정 (민사적 해결)<br>홈페이지 : <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener">privacy.kisa.or.kr</a><br>전화 : (국번없이) 118</div>
  <p>▶ 대검찰청 사이버범죄수사단 : 02-3480-3573 (<a href="https://www.spo.go.kr" target="_blank" rel="noopener">www.spo.go.kr</a>)<br>▶ 경찰청 사이버범죄수사단 : 1566-0112 (<a href="https://www.netan.go.kr" target="_blank" rel="noopener">www.netan.go.kr</a>)</p>

  <h2>11. 개인정보 처리방침 변경</h2>
  <p>① 이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경 내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.</p>

  <footer class="page">ⓒ 북슐랭 (Bookchelin) — 무제한 무료 독서 앱</footer>
</div>
</body>
</html>`;
}

async function renderSitemap(db, res) {
  const [snap, indexSnap] = await Promise.all([
    db.collection('books').where('hidden', '==', false).get(),
    db.doc('search_index/books').get(),
  ]);
  // 카탈로그가 마지막으로 바뀐 시각(search_index/books.updated_at — 책 변경마다 갱신)을
  // 홈 URL 의 lastmod 로 제공한다. books 문서엔 per-doc 타임스탬프가 없어
  // 책 URL 별 lastmod 는 날짜를 지어내지 않도록 생략한다.
  let homeLastmod = '';
  const upd = indexSnap.exists ? indexSnap.data().updated_at : null;
  if (upd && typeof upd.toDate === 'function') {
    homeLastmod = `<lastmod>${upd.toDate().toISOString().slice(0, 10)}</lastmod>`;
  }
  const urls = [
    `  <url><loc>${WEB_BASE_URL}/</loc>${homeLastmod}</url>`,
    `  <url><loc>${WEB_BASE_URL}/privacy</loc></url>`,
  ];
  snap.forEach((d) => {
    urls.push(`  <url><loc>${WEB_BASE_URL}/book/${d.id}</loc></url>`);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.status(200).send(xml);
}

async function handleWebBook(db, req, res) {
  const path = req.path || '/';

  if (path === '/' || path === '') {
    return renderLanding(db, res);
  }

  if (path === '/sitemap.xml') {
    return renderSitemap(db, res);
  }

  if (path === '/privacy' || path === '/privacy/') {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(renderPrivacyHtml());
  }

  const m = path.match(/^\/book\/([A-Za-z0-9]{10,40})\/?$/);
  if (!m) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(404).send(render404());
  }
  const bookId = m[1];

  const doc = await db.collection('books').doc(bookId).get();
  if (!doc.exists || doc.data().hidden === true) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(404).send(render404());
  }

  const reviews = await loadReviews(db, bookId);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600, s-maxage=86400');
  return res.status(200).send(renderBookHtml(bookId, doc.data(), reviews));
}

module.exports = { handleWebBook };
