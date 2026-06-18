export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ["BWRD4QG7TL.bookchelin.bookchelin"],
        appID: "BWRD4QG7TL.bookchelin.bookchelin",
        paths: ["/book/*"],
        components: [
          {
            "/": "/book/*",
            comment: "책 상세 페이지는 앱으로 연다",
          },
        ],
      },
    ],
  },
} as const;

export function createAppleAssociationResponse(): Response {
  return Response.json(APPLE_APP_SITE_ASSOCIATION, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
