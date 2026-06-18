import type { Metadata } from "next";

import { BookSearch } from "@/components/book-search";
import { getVisibleBooks } from "@/lib/book-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모든 책",
  description: "북슐랭에서 무료로 읽을 수 있는 전자책을 제목과 소개로 검색해보세요.",
  alternates: { canonical: "/books" },
};

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [books, query] = await Promise.all([
    getVisibleBooks(),
    searchParams.then((params) => typeof params.q === "string" ? params.q : ""),
  ]);
  return (
    <div className="page-shell container">
      <header className="page-heading"><span className="eyebrow">북슐랭 서재</span><h1>모든 책</h1><p>지금 끌리는 단어로 책을 찾아보세요.</p></header>
      <BookSearch books={books} initialQuery={query} />
    </div>
  );
}
