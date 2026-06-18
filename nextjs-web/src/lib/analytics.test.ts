import { describe, expect, test } from "vitest";

import { buildAnalyticsPayload } from "./analytics";

describe("buildAnalyticsPayload", () => {
  test("keeps the install attribution fields", () => {
    expect(
      buildAnalyticsPayload({
        platform: "ios",
        placement: "book_detail",
        book_id: "book-1",
        source: "organic_search",
      }),
    ).toEqual({
      platform: "ios",
      placement: "book_detail",
      book_id: "book-1",
      source: "organic_search",
    });
  });

  test("removes undefined values before logging", () => {
    expect(
      buildAnalyticsPayload({
        platform: "android",
        placement: "header",
        book_id: undefined,
        source: "direct",
      }),
    ).toEqual({
      platform: "android",
      placement: "header",
      source: "direct",
    });
  });
});
