import { expect, test } from "vitest";

import { PRIVACY_OFFICER } from "./privacy-policy";

test("publishes the current privacy officer contact", () => {
  expect(PRIVACY_OFFICER).toEqual({
    name: "이용상",
    phone: "010-9723-0916",
    email: "bookchelin@naver.com",
  });
});
