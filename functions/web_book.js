// 검색엔진 노출용(SEO/AEO) 공개 웹 페이지 렌더러.
//  - GET /book/{bookId} : 책 소개 SSR 페이지 (표지/소개/목차/리뷰 + 앱 스토어 유도)
//  - GET /sitemap.xml   : 공개(hidden=false) 책 전체 사이트맵
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
    ${image ? `<img class="cover" src="${escapeHtml(image)}" alt="${title} 표지">` : ''}
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
