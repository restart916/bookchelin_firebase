"use client";

import Link from "next/link";

import { CATEGORY_BY_ID } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics";
import type { BookSummary } from "@/lib/types";

export function BookCard({
  book,
  priority = false,
  source = "catalog",
}: {
  book: BookSummary;
  priority?: boolean;
  source?: string;
}) {
  const category = book.categoryId ? CATEGORY_BY_ID[book.categoryId] : null;
  return (
    <article className="book-card">
      <Link
        href={`/book/${encodeURIComponent(book.id)}`}
        className="book-card__link"
        onClick={() => void trackEvent("select_book", {
          book_id: book.id,
          category: book.categoryId,
          source,
        })}
      >
        <div className="book-card__cover">
          {book.imageUrl ? (
            // Covers are legacy hotlinks across several providers, so Next image host allowlisting is not viable yet.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.imageUrl}
              alt={`${book.title} 표지`}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="book-card__fallback" aria-hidden="true">북슐랭</span>
          )}
        </div>
        {category ? <span className="eyebrow">{category.name}</span> : null}
        <h3>{book.title}</h3>
        {book.publisher ? <p>{book.publisher}</p> : null}
      </Link>
    </article>
  );
}
