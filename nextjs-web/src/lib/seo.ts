import type { MetadataRoute } from "next";

import {
  ANDROID_STORE_URL,
  CATEGORY_BY_ID,
  IOS_STORE_URL,
  SITE_URL,
} from "./constants";
import type { BookReviewSummary, BookSummary } from "./types";

function bookUrl(book: BookSummary): string {
  return `${SITE_URL}/book/${encodeURIComponent(book.id)}`;
}

export function buildHomeJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "북슐랭",
      alternateName: "Bookchelin",
      url: SITE_URL,
      sameAs: [IOS_STORE_URL, ANDROID_STORE_URL],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "북슐랭",
      alternateName: "Bookchelin",
      url: SITE_URL,
      inLanguage: "ko-KR",
      publisher: { "@type": "Organization", name: "북슐랭" },
    },
    {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "북슐랭",
      operatingSystem: "Android, iOS",
      applicationCategory: "BookApplication",
      isAccessibleForFree: true,
      url: SITE_URL,
      downloadUrl: [IOS_STORE_URL, ANDROID_STORE_URL],
    },
  ];
}

export function buildBookJsonLd(book: BookSummary, reviews: BookReviewSummary) {
  const category = book.categoryId ? CATEGORY_BY_ID[book.categoryId] : null;
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    description: book.description.slice(0, 300),
    url: bookUrl(book),
    bookFormat: "https://schema.org/EBook",
    inLanguage: "ko",
    isAccessibleForFree: true,
    ...(book.imageUrl ? { image: book.imageUrl } : {}),
    ...(book.publisher ? { publisher: { "@type": "Organization", name: book.publisher } } : {}),
    ...(category ? { genre: category.name } : {}),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
    },
    ...(reviews.count > 0 && reviews.average !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviews.average,
            ratingCount: reviews.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

export function buildBreadcrumbJsonLd(book: BookSummary) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "북슐랭", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: book.title, item: bookUrl(book) },
    ],
  };
}

export function buildSitemapEntries(books: Array<BookSummary | null>): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/books", "/privacy", "/community-guidelines"];
  const categoryRoutes = Object.values(CATEGORY_BY_ID).map((category) => `/category/${category.slug}`);
  return [
    ...staticRoutes.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : 0.7 })),
    ...categoryRoutes.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...books.flatMap((book) => book ? [{ url: bookUrl(book), changeFrequency: "monthly" as const, priority: 0.6 }] : []),
  ];
}
