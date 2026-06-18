import { describe, expect, test } from "vitest";

import { mapBook } from "./books";
import {
  buildBookJsonLd,
  buildBreadcrumbJsonLd,
  buildHomeJsonLd,
  buildSitemapEntries,
} from "./seo";
import type { BookReviewSummary, BookSummary } from "./types";

const book: BookSummary = {
  id: "book-1",
  title: "메밀꽃 필 무렵",
  description: "달빛 아래 펼쳐지는 이야기",
  toc: "첫 장",
  imageUrl: "https://example.com/cover.jpg",
  categoryId: "5",
  publisher: "북슐랭",
  storeLinks: { yes24: "", kyobo: "", aladin: "" },
};

describe("book structured data", () => {
  test("uses the production canonical and never includes reader content URLs", () => {
    const jsonLd = buildBookJsonLd(book, { count: 0, average: null, items: [] });
    expect(jsonLd.url).toBe("https://bookchelin.com/book/book-1");
    expect(JSON.stringify(jsonLd)).not.toContain("firestore_url");
    expect(JSON.stringify(jsonLd)).not.toContain(".epub");
  });

  test("adds aggregate rating only when visible ratings exist", () => {
    const reviews: BookReviewSummary = { count: 3, average: 4.3, items: [] };
    expect(buildBookJsonLd(book, reviews)).toMatchObject({
      aggregateRating: { ratingValue: 4.3, ratingCount: 3 },
    });
    expect(buildBookJsonLd(book, { count: 0, average: null, items: [] })).not.toHaveProperty("aggregateRating");
  });

  test("builds a two-level breadcrumb", () => {
    expect(buildBreadcrumbJsonLd(book).itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "북슐랭", item: "https://bookchelin.com" },
      { "@type": "ListItem", position: 2, name: "메밀꽃 필 무렵", item: "https://bookchelin.com/book/book-1" },
    ]);
  });
});

test("sitemap entries exclude hidden books", () => {
  const hidden = mapBook("hidden", { title: "숨긴 책", hidden: true });
  const entries = buildSitemapEntries([book, hidden]);
  expect(entries.some((entry) => entry.url.endsWith("/book/book-1"))).toBe(true);
  expect(entries.some((entry) => entry.url.includes("hidden"))).toBe(false);
});

test("home structured data identifies the website, publisher, and mobile app", () => {
  const jsonLd = buildHomeJsonLd();

  expect(jsonLd.map((item) => item["@type"])).toEqual([
    "Organization",
    "WebSite",
    "MobileApplication",
  ]);
  expect(jsonLd).toEqual(expect.arrayContaining([
    expect.objectContaining({ "@type": "WebSite", url: "https://bookchelin.com" }),
    expect.objectContaining({
      "@type": "MobileApplication",
      name: "북슐랭",
      operatingSystem: "Android, iOS",
    }),
  ]));
});
