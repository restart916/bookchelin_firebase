import type { BookSummary } from "./types";

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko");
}

export function filterBooks(books: BookSummary[], query: string): BookSummary[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return books;

  return books.filter((book) =>
    normalizeSearchText(
      [book.title, book.description, book.publisher].join(" "),
    ).includes(normalizedQuery),
  );
}
