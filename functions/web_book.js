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
<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">
<meta property="og:type" content="book">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${metaDescription}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
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
  <a href="${IOS_STORE_URL}">App Store</a>
  <a class="android" href="${ANDROID_STORE_URL}">Google Play</a>
</div>
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
  const [featured, countSnap] = await Promise.all([
    loadFeaturedBooks(db),
    db.collection('books').where('hidden', '==', false).count().get(),
  ]);
  const bookCount = countSnap.data().count;

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

async function renderSitemap(db, res) {
  const snap = await db.collection('books').where('hidden', '==', false).get();
  const urls = [`  <url><loc>${WEB_BASE_URL}/</loc></url>`];
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
