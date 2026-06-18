import "server-only";

import { unstable_cache } from "next/cache";

import { mapBook, summarizeReviews } from "./books";
import { adminDb } from "./firebase-admin";
import type {
  BookReviewSummary,
  BookSummary,
  HomeData,
  SuggestGroup,
} from "./types";

type FirestoreRow = Record<string, unknown>;

function idsFromCuration(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (
      item &&
      typeof item === "object" &&
      typeof (item as FirestoreRow).book_id === "string"
    ) {
      const id = ((item as FirestoreRow).book_id as string).trim();
      return id ? [id] : [];
    }
    return [];
  });
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

async function loadBooksByIds(ids: string[]): Promise<BookSummary[]> {
  const orderedIds = unique(ids);
  if (orderedIds.length === 0) return [];

  const snapshots = await adminDb.getAll(
    ...orderedIds.map((id) => adminDb.collection("books").doc(id)),
  );
  const booksById = new Map<string, BookSummary>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const book = mapBook(snapshot.id, snapshot.data() as FirestoreRow);
    if (book) booksById.set(book.id, book);
  }
  return orderedIds.flatMap((id) => {
    const book = booksById.get(id);
    return book ? [book] : [];
  });
}

async function loadVisibleBooks(): Promise<BookSummary[]> {
  const snapshot = await adminDb.collection("books").get();
  return snapshot.docs
    .flatMap((document) => {
      const book = mapBook(document.id, document.data() as FirestoreRow);
      return book ? [book] : [];
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

export const getVisibleBooks = unstable_cache(
  loadVisibleBooks,
  ["visible-books"],
  { revalidate: 3600, tags: ["books"] },
);

export const getVisibleBook = unstable_cache(
  async (id: string): Promise<BookSummary | null> => {
    const snapshot = await adminDb.collection("books").doc(id).get();
    if (!snapshot.exists) return null;
    return mapBook(snapshot.id, snapshot.data() as FirestoreRow);
  },
  ["visible-book"],
  { revalidate: 3600, tags: ["books"] },
);

export const getBookReviews = unstable_cache(
  async (id: string): Promise<BookReviewSummary> => {
    const snapshot = await adminDb
      .collection("book_reviews")
      .where("book_id", "==", id)
      .limit(200)
      .get();
    return summarizeReviews(
      snapshot.docs.map((document) => document.data() as FirestoreRow),
    );
  },
  ["book-reviews"],
  { revalidate: 3600, tags: ["reviews"] },
);

async function loadHomeData(): Promise<HomeData> {
  const [homeSnapshot, groupSnapshot] = await Promise.all([
    adminDb.collection("home_dynamic").doc("current").get(),
    adminDb.collection("suggest_group").orderBy("order", "asc").get(),
  ]);
  const home = homeSnapshot.exists
    ? (homeSnapshot.data() as FirestoreRow)
    : {};
  const carouselIds = idsFromCuration(home.carousel);
  const trendingIds = idsFromCuration(home.trending);
  const discoverIds = idsFromCuration(home.discover);

  const manualGroups = groupSnapshot.docs
    .filter((document) => !document.id.startsWith("_auto_"))
    .map((document) => ({
      id: document.id,
      title:
        typeof document.data().title === "string"
          ? document.data().title.trim()
          : "",
      ids: idsFromCuration(document.data().books),
    }))
    .filter((group) => group.title && group.ids.length > 0);

  const allIds = unique([
    ...carouselIds,
    ...trendingIds,
    ...discoverIds,
    ...manualGroups.flatMap((group) => group.ids),
  ]);
  const books = await loadBooksByIds(allIds);
  const byId = new Map(books.map((book) => [book.id, book]));
  const pick = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const suggestGroups: SuggestGroup[] = manualGroups.map((group) => ({
    id: group.id,
    title: group.title,
    books: pick(group.ids),
  })).filter((group) => group.books.length > 0);

  return {
    carousel: pick(carouselIds),
    trending: pick(trendingIds),
    discover: pick(discoverIds),
    suggestGroups,
  };
}

export const getHomeData = unstable_cache(loadHomeData, ["home-data"], {
  revalidate: 600,
  tags: ["home", "books"],
});
