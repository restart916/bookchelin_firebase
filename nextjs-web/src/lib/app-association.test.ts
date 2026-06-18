import { describe, expect, test } from "vitest";

import { APPLE_APP_SITE_ASSOCIATION, createAppleAssociationResponse } from "./app-association";

describe("Apple app-site association", () => {
  test("only opens public book detail paths in the iOS app", () => {
    expect(APPLE_APP_SITE_ASSOCIATION.applinks.details[0]).toMatchObject({
      appIDs: ["BWRD4QG7TL.bookchelin.bookchelin"],
      paths: ["/book/*"],
    });
  });

  test("is served as JSON instead of a generic binary file", async () => {
    const response = createAppleAssociationResponse();
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual(APPLE_APP_SITE_ASSOCIATION);
  });
});
