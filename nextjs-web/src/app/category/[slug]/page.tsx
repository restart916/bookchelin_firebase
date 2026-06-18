import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookCard } from "@/components/book-card";
import { getVisibleBooks } from "@/lib/book-repository";
import { CATEGORY_BY_SLUG } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(CATEGORY_BY_SLUG).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = CATEGORY_BY_SLUG[(await params).slug as keyof typeof CATEGORY_BY_SLUG];
  if (!category) return {};
  return {
    title: `${category.name} 전자책`,
    description: `${category.description}. 북슐랭 앱에서 무료로 읽어보세요.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = CATEGORY_BY_SLUG[slug as keyof typeof CATEGORY_BY_SLUG];
  if (!category) notFound();
  const books = (await getVisibleBooks()).filter((book) => book.categoryId === category.id);

  return (
    <div className="page-shell container">
      <header className="page-heading page-heading--category"><span className="eyebrow">CATEGORY {category.id}</span><h1>{category.name}</h1><p>{category.description}</p></header>
      <p className="result-count">{books.length}권</p>
      <div className="book-grid">{books.map((book) => <BookCard key={book.id} book={book} source={`category_${category.slug}`} />)}</div>
    </div>
  );
}
