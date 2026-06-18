import { describe, expect, test } from "vitest";

import { filterBooks, normalizeSearchText } from "./search";
import type { BookSummary } from "./types";

const books: BookSummary[] = [
  {
    id: "1",
    title: "메밀꽃 필 무렵",
    description: "달빛 아래 펼쳐지는 한국 단편소설",
    toc: "",
    imageUrl: "",
    categoryId: "5",
    publisher: "",
    storeLinks: { yes24: "", kyobo: "", aladin: "" },
  },
  {
    id: "2",
    title: "Small Habits",
    description: "매일 만드는 작은 변화",
    toc: "",
    imageUrl: "",
    categoryId: "2",
    publisher: "Book Lab",
    storeLinks: { yes24: "", kyobo: "", aladin: "" },
  },
];

describe("normalizeSearchText", () => {
  test("normalizes whitespace and latin case", () => {
    expect(normalizeSearchText("  SMALL   Habits  ")).toBe("small habits");
  });
});

describe("filterBooks", () => {
  test("matches Korean titles", () => {
    expect(filterBooks(books, "메밀꽃").map((book) => book.id)).toEqual(["1"]);
  });

  test("matches descriptions", () => {
    expect(filterBooks(books, "한국 단편").map((book) => book.id)).toEqual(["1"]);
  });

  test("matches latin text without case sensitivity", () => {
    expect(filterBooks(books, "BOOK LAB").map((book) => book.id)).toEqual(["2"]);
  });

  test("returns every book and count for an empty query", () => {
    const result = filterBooks(books, "   ");
    expect(result).toHaveLength(2);
    expect(result.map((book) => book.id)).toEqual(["1", "2"]);
  });
});
