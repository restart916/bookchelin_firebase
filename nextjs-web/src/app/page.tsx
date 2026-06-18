import Link from "next/link";

import { BookCard } from "@/components/book-card";
import { StoreCta } from "@/components/store-cta";
import { getHomeData } from "@/lib/book-repository";
import { CATEGORY_BY_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

const faq = [
  { question: "북슐랭은 정말 무료인가요?", answer: "네. 앱에서 제공하는 모든 책을 별도 구독 없이 무료로 읽을 수 있어요." },
  { question: "어떤 책이 있나요?", answer: "문학, 지식교양, 경제경영, 자기계발, 키즈, 취업수험까지 여섯 분야의 전자책을 만날 수 있어요." },
  { question: "웹에서도 책을 읽을 수 있나요?", answer: "책 소개는 웹에서 둘러볼 수 있고, 전체 내용은 북슐랭 앱에서 읽을 수 있어요." },
];

export default async function HomePage() {
  const home = await getHomeData();
  const heroBooks = home.carousel.length > 0 ? home.carousel : home.trending.slice(0, 6);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="hero__kicker">오늘, 어떤 문장을 만나고 싶나요?</span>
            <h1>좋은 책을 고르는 시간부터<br />독서는 시작되니까.</h1>
            <p>매일 새롭게 고른 책을 발견하고, 북슐랭 앱에서 끝까지 무료로 읽어보세요.</p>
            <StoreCta placement="home_hero" source="home" />
          </div>
          <div className="hero__shelf" aria-label="오늘의 추천 책">
            {heroBooks.slice(0, 5).map((book, index) => (
              <Link key={book.id} href={`/book/${encodeURIComponent(book.id)}`} className={`hero-book hero-book--${index + 1}`}>
                {book.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={book.imageUrl} alt={`${book.title} 표지`} referrerPolicy="no-referrer" />
                ) : <span>{book.title}</span>}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {home.trending.length > 0 ? (
        <section className="content-section container">
          <div className="section-heading">
            <div><span className="eyebrow">지금 인기</span><h2>독자들이 요즘 많이 읽는 책</h2></div>
            <Link href="/books">전체 보기 →</Link>
          </div>
          <div className="book-grid">{home.trending.slice(0, 6).map((book) => <BookCard key={book.id} book={book} source="home_trending" />)}</div>
        </section>
      ) : null}

      <section className="category-section">
        <div className="container">
          <div className="section-heading"><div><span className="eyebrow">취향 탐색</span><h2>오늘의 마음에 맞는 서가</h2></div></div>
          <div className="category-grid">
            {Object.values(CATEGORY_BY_ID).map((category, index) => (
              <Link href={`/category/${category.slug}`} key={category.id} className={`category-tile category-tile--${index + 1}`}>
                <span>0{category.id}</span><h3>{category.name}</h3><p>{category.description}</p><b aria-hidden="true">↗</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {home.discover.length > 0 ? (
        <section className="content-section container">
          <div className="section-heading"><div><span className="eyebrow">오늘의 발견</span><h2>한 권쯤 뜻밖의 선택</h2></div></div>
          <div className="book-grid">{home.discover.slice(0, 6).map((book) => <BookCard key={book.id} book={book} source="home_discover" />)}</div>
        </section>
      ) : null}

      {home.suggestGroups.slice(0, 3).map((group) => (
        <section className="content-section container" key={group.id}>
          <div className="section-heading"><div><span className="eyebrow">북슐랭 큐레이션</span><h2>{group.title}</h2></div></div>
          <div className="book-grid">{group.books.slice(0, 6).map((book) => <BookCard key={book.id} book={book} source={`suggest_${group.id}`} />)}</div>
        </section>
      ))}

      <section className="faq-section container">
        <div><span className="eyebrow">궁금한 점</span><h2>북슐랭, 이렇게 읽어요</h2></div>
        <div>{faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <section id="download" className="download-section">
        <div className="container"><span>BOOKCHELIN APP</span><h2>마음에 담은 책,<br />앱에서 바로 펼쳐보세요.</h2><p>로그인 없이 시작하는 무제한 무료 독서</p><StoreCta placement="home_bottom" source="home" /></div>
      </section>
    </>
  );
}
