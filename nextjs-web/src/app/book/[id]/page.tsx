import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookViewEvent } from "@/components/book-view-event";
import { StoreCta } from "@/components/store-cta";
import { getBookReviews, getVisibleBook } from "@/lib/book-repository";
import { CATEGORY_BY_ID, SITE_URL } from "@/lib/constants";
import { buildBookJsonLd, buildBreadcrumbJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getVisibleBook(id);
  if (!book) return { title: "책을 찾을 수 없습니다" };
  const description = book.description.slice(0, 155) || `${book.title}을 북슐랭 앱에서 무료로 읽어보세요.`;
  const canonical = `/book/${encodeURIComponent(book.id)}`;
  return {
    title: `${book.title} | 무료 전자책`,
    description,
    alternates: { canonical },
    openGraph: { type: "book", title: book.title, description, url: canonical, images: book.imageUrl ? [book.imageUrl] : [] },
    twitter: { card: "summary_large_image", title: book.title, description, images: book.imageUrl ? [book.imageUrl] : [] },
    other: { "apple-itunes-app": `app-id=1544648278, app-argument=${SITE_URL}${canonical}` },
  };
}

export default async function BookPage({ params }: Props) {
  const { id } = await params;
  const book = await getVisibleBook(id);
  if (!book) notFound();
  const reviews = await getBookReviews(id);
  const category = book.categoryId ? CATEGORY_BY_ID[book.categoryId] : null;
  const jsonLd = [buildBookJsonLd(book, reviews), buildBreadcrumbJsonLd(book)];

  return (
    <article className="book-detail container">
      <BookViewEvent bookId={book.id} category={book.categoryId} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="breadcrumbs" aria-label="현재 위치"><Link href="/">홈</Link><span>/</span>{category ? <Link href={`/category/${category.slug}`}>{category.name}</Link> : <Link href="/books">책</Link>}<span>/</span><span>{book.title}</span></nav>
      <div className="book-detail__hero">
        <div className="book-detail__cover">
          {book.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.imageUrl} alt={`${book.title} 표지`} referrerPolicy="no-referrer" />
          ) : <span>북슐랭</span>}
        </div>
        <div className="book-detail__intro">
          {category ? <Link className="eyebrow" href={`/category/${category.slug}`}>{category.name}</Link> : null}
          <h1>{book.title}</h1>
          {reviews.average !== null ? <p className="rating">★ {reviews.average} <span>리뷰 {reviews.count}개</span></p> : null}
          <p className="book-detail__lede">이 책의 전체 내용은 북슐랭 앱에서 무료로 읽을 수 있어요.</p>
          <StoreCta placement="book_detail" bookId={book.id} source="book_detail" />
        </div>
      </div>

      <div className="book-detail__body">
        <section><h2>책 소개</h2><p className="preline">{book.description || "북슐랭 앱에서 책을 만나보세요."}</p></section>
        {book.toc ? <section><h2>목차</h2><p className="preline toc">{book.toc}</p></section> : null}
        {reviews.items.length > 0 ? <section><h2>독자 리뷰</h2><div className="review-list">{reviews.items.map((review, index) => <blockquote key={`${index}-${review.review}`}><p>{review.review}</p><footer>{review.rating ? `★ ${review.rating}` : ""}{review.userName ? ` · ${review.userName}` : ""}</footer></blockquote>)}</div></section> : null}
        {Object.values(book.storeLinks).some(Boolean) ? <section><h2>종이책·전자책 구매처</h2><div className="external-links">{book.storeLinks.yes24 ? <a href={book.storeLinks.yes24} target="_blank" rel="noopener noreferrer">YES24 ↗</a> : null}{book.storeLinks.kyobo ? <a href={book.storeLinks.kyobo} target="_blank" rel="noopener noreferrer">교보문고 ↗</a> : null}{book.storeLinks.aladin ? <a href={book.storeLinks.aladin} target="_blank" rel="noopener noreferrer">알라딘 ↗</a> : null}</div></section> : null}
      </div>
    </article>
  );
}
