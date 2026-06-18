"use client";

import { useEffect, useMemo, useState } from "react";

import { BookCard } from "@/components/book-card";
import { trackEvent } from "@/lib/analytics";
import { filterBooks, normalizeSearchText } from "@/lib/search";
import type { BookSummary } from "@/lib/types";

export function BookSearch({ books, initialQuery = "" }: { books: BookSummary[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(() => filterBooks(books, query), [books, query]);

  useEffect(() => {
    const normalized = normalizeSearchText(query);
    if (!normalized) return;
    const timeout = window.setTimeout(() => {
      void trackEvent("search", {
        search_term: normalized,
        result_count: results.length,
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [query, results.length]);

  return (
    <div className="catalog-search">
      <label className="search-box">
        <span className="sr-only">책 검색</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="제목, 소개, 출판사로 검색"
          autoComplete="off"
        />
      </label>
      <p className="result-count" aria-live="polite">
        {query.trim() ? `검색 결과 ${results.length}권` : `전체 ${results.length}권`}
      </p>
      {results.length > 0 ? (
        <div className="book-grid">
          {results.map((book) => <BookCard key={book.id} book={book} source="search" />)}
        </div>
      ) : (
        <div className="empty-state">
          <strong>찾는 책이 없어요.</strong>
          <p>검색어를 조금 짧게 바꿔보세요.</p>
        </div>
      )}
    </div>
  );
}
