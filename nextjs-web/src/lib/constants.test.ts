import { describe, expect, it } from "vitest";

import {
  CATEGORY_BY_ID,
  CATEGORY_BY_SLUG,
  SITE_URL,
} from "./constants";

describe("public site constants", () => {
  it("uses the purchased canonical domain", () => {
    expect(SITE_URL).toBe("https://bookchelin.com");
  });

  it("round-trips every category between id and slug", () => {
    expect(Object.keys(CATEGORY_BY_ID)).toHaveLength(6);

    for (const category of Object.values(CATEGORY_BY_ID)) {
      expect(CATEGORY_BY_SLUG[category.slug]).toEqual(category);
    }
  });
});
