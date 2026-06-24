import { describe, expect, test } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  test("uses Bookchelin branding and install icons", () => {
    expect(manifest()).toEqual({
      name: "북슐랭",
      short_name: "북슐랭",
      description: "좋은 전자책을 무료로 읽는 북슐랭",
      start_url: "/",
      display: "standalone",
      background_color: "#fb3026",
      theme_color: "#fb3026",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });
});
