import { describe, expect, test } from "vitest";

import { mapBook, summarizeReviews } from "./books";

describe("mapBook", () => {
  test("normalizes the public book fields and omits reader content URLs", () => {
    const book = mapBook("book-1", {
      title: "  메밀꽃 필 무렵  ",
      description: "  작품 소개  ",
      toc: "  첫 장\n둘째 장  ",
      image_url: "  https://example.com/cover.jpg  ",
      category: 5,
      publisher: "  북슐랭  ",
      shop_yes24_link: "  https://yes24.example/book  ",
      shop_bandi_link: "https://kyobo.example/book",
      shop_inter_link: "https://aladin.example/book",
      firestore_url: "epub/secret.epub",
      unexpected: "not-public",
    });

    expect(book).toEqual({
      id: "book-1",
      title: "메밀꽃 필 무렵",
      description: "작품 소개",
      toc: "첫 장\n둘째 장",
      imageUrl: "https://example.com/cover.jpg",
      categoryId: "5",
      publisher: "북슐랭",
      storeLinks: {
        yes24: "https://yes24.example/book",
        kyobo: "https://kyobo.example/book",
        aladin: "https://aladin.example/book",
      },
    });
    expect(book).not.toHaveProperty("firestore_url");
  });

  test("uses empty strings and links for missing optional fields", () => {
    expect(mapBook("book-2", { title: "제목", category: "1" })).toEqual({
      id: "book-2",
      title: "제목",
      description: "",
      toc: "",
      imageUrl: "",
      categoryId: "1",
      publisher: "",
      storeLinks: { yes24: "", kyobo: "", aladin: "" },
    });
  });

  test("rejects hidden and titleless books", () => {
    expect(mapBook("hidden", { title: "숨긴 책", hidden: true })).toBeNull();
    expect(mapBook("untitled", { description: "제목 없음" })).toBeNull();
  });
});

describe("summarizeReviews", () => {
  test("excludes hidden reviews and rounds the visible rating average", () => {
    const summary = summarizeReviews([
      { rating: 5, review: "좋아요", user_name: "독자 1" },
      { rating: 4, review: "재미있어요", user_name: "독자 2" },
      { rating: 1, review: "숨김", hide: "1" },
      { rating: 0, review: "범위 밖 평점" },
    ]);

    expect(summary.count).toBe(2);
    expect(summary.average).toBe(4.5);
    expect(summary.items.map((item) => item.review)).toEqual(["좋아요", "재미있어요", "범위 밖 평점"]);
  });

  test("caps displayed review text at five without capping rating count", () => {
    const summary = summarizeReviews(
      Array.from({ length: 7 }, (_, index) => ({
        rating: 3,
        review: `리뷰 ${index + 1}`,
        user_name: `독자 ${index + 1}`,
      })),
    );

    expect(summary.count).toBe(7);
    expect(summary.items).toHaveLength(5);
  });
});
