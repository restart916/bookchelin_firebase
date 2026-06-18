export const SITE_URL = "https://bookchelin.com";

export const IOS_APP_ID = "1544648278";
export const IOS_STORE_URL = `https://apps.apple.com/kr/app/id${IOS_APP_ID}`;
export const ANDROID_PACKAGE = "com.bookchelin.bookchelin";
export const ANDROID_STORE_URL =
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export type Category = {
  id: "1" | "2" | "3" | "4" | "5" | "6";
  slug: "knowledge" | "growth" | "career" | "kids" | "literature" | "business";
  name: string;
  description: string;
};

export const CATEGORY_BY_ID: Record<Category["id"], Category> = {
  "1": { id: "1", slug: "knowledge", name: "지식교양", description: "세상을 이해하는 폭을 넓혀주는 책" },
  "2": { id: "2", slug: "growth", name: "자기계발", description: "오늘의 나를 한 걸음 성장시키는 책" },
  "3": { id: "3", slug: "career", name: "취업수험", description: "시험과 커리어를 준비하는 실용적인 책" },
  "4": { id: "4", slug: "kids", name: "키즈", description: "아이와 함께 읽고 이야기하기 좋은 책" },
  "5": { id: "5", slug: "literature", name: "문학", description: "오래 남는 이야기와 문장을 만나는 책" },
  "6": { id: "6", slug: "business", name: "경제경영", description: "일과 돈의 흐름을 읽는 데 도움이 되는 책" },
};

export const CATEGORY_BY_SLUG = Object.fromEntries(
  Object.values(CATEGORY_BY_ID).map((category) => [category.slug, category]),
) as Record<Category["slug"], Category>;
