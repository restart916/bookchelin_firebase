import type { Category } from "./constants";

export type StoreLinks = {
  yes24: string;
  kyobo: string;
  aladin: string;
};

export type BookSummary = {
  id: string;
  title: string;
  description: string;
  toc: string;
  imageUrl: string;
  categoryId: Category["id"] | "";
  publisher: string;
  storeLinks: StoreLinks;
};

export type BookDetail = BookSummary;

export type BookReview = {
  rating: number | null;
  review: string;
  userName: string;
};

export type BookReviewSummary = {
  count: number;
  average: number | null;
  items: BookReview[];
};

export type SuggestGroup = {
  id: string;
  title: string;
  books: BookSummary[];
};

export type HomeData = {
  carousel: BookSummary[];
  trending: BookSummary[];
  discover: BookSummary[];
  suggestGroups: SuggestGroup[];
};
