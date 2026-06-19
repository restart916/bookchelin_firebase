import { expect, test } from "vitest";

import {
  COMMUNITY_GUIDELINE_SECTIONS,
  COMMUNITY_POLICY_VERSION,
} from "./community-guidelines";

test("publishes a versioned review policy with required safety controls", () => {
  expect(COMMUNITY_POLICY_VERSION).toBe("2026-06-19");
  const policy = COMMUNITY_GUIDELINE_SECTIONS.join(" ");
  expect(policy).toContain("helgi2019@gmail.com");
  expect(policy).toContain("신고");
  expect(policy).toContain("차단");
  expect(policy).toContain("숨김");
  expect(policy).toContain("욕설");
  expect(policy).toContain("광고");
});
