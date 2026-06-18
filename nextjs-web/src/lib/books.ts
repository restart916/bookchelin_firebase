import type {
  BookReview,
  BookReviewSummary,
  BookSummary,
} from "./types";

const CATEGORY_IDS = new Set(["1", "2", "3", "4", "5", "6"]);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function categoryValue(value: unknown): BookSummary["categoryId"] {
  const normalized = typeof value === "number" ? String(value) : stringValue(value);
  return CATEGORY_IDS.has(normalized)
    ? (normalized as BookSummary["categoryId"])
    : "";
}

export function mapBook(
  id: string,
  data: Record<string, unknown>,
): BookSummary | null {
  if (data.hidden === true) return null;

  const title = stringValue(data.title);
  if (!title) return null;

  return {
    id,
    title,
    description: stringValue(data.description),
    toc: stringValue(data.toc),
    imageUrl: stringValue(data.image_url),
    categoryId: categoryValue(data.category),
    publisher: stringValue(data.publisher),
    storeLinks: {
      yes24: stringValue(data.shop_yes24_link),
      kyobo: stringValue(data.shop_bandi_link),
      aladin: stringValue(data.shop_inter_link),
    },
  };
}

export function summarizeReviews(
  rows: Array<Record<string, unknown>>,
): BookReviewSummary {
  let ratingTotal = 0;
  let ratingCount = 0;
  const items: BookReview[] = [];

  for (const row of rows) {
    if (row.hide === "1") continue;

    const rating =
      typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5
        ? row.rating
        : null;
    if (rating !== null) {
      ratingTotal += rating;
      ratingCount += 1;
    }

    const review = stringValue(row.review);
    if (review.length > 1 && items.length < 5) {
      items.push({
        rating,
        review,
        userName: stringValue(row.user_name),
      });
    }
  }

  return {
    count: ratingCount,
    average:
      ratingCount > 0
        ? Math.round((ratingTotal / ratingCount) * 10) / 10
        : null,
    items,
  };
}
