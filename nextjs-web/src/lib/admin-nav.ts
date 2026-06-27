// Admin section registry — shared by the admin layout nav and the dashboard.
// `ready` flips to true as each Vue view is reimplemented in Next.js (Phase 2).

export interface AdminSection {
  href: string;
  label: string;
  description: string;
  group: "콘텐츠" | "홈 구성" | "이벤트" | "통계" | "리뷰/기타";
  ready: boolean;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin/edit", label: "책 관리", description: "책 CRUD · 카테고리 · 출판사", group: "콘텐츠", ready: true },
  { href: "/admin/categories", label: "카테고리 관리", description: "book_category_v2 CRUD · 아이콘", group: "콘텐츠", ready: true },
  { href: "/admin/publishers", label: "출판사 관리", description: "출판사 CRUD · 코드 발급 · 통계 바로보기", group: "콘텐츠", ready: true },
  { href: "/admin/export", label: "책 내보내기", description: "책 목록 export", group: "콘텐츠", ready: true },
  { href: "/admin/edit-banner", label: "배너", description: "배너 관리", group: "홈 구성", ready: true },
  { href: "/admin/edit-main-book", label: "메인/캐러셀", description: "홈 메인북 · 캐러셀 핀", group: "홈 구성", ready: true },
  { href: "/admin/edit-suggest-book", label: "추천 그룹", description: "suggest_group 구성", group: "홈 구성", ready: true },
  { href: "/admin/home-curation", label: "지금 인기·오늘의 발견", description: "자동 편성 + 수동 제외(빼기)", group: "홈 구성", ready: true },
  { href: "/admin/edit-link-select", label: "링크 셀렉트", description: "link_select 관리", group: "홈 구성", ready: true },
  { href: "/admin/edit-log-select", label: "로그 셀렉트", description: "log_select 관리", group: "홈 구성", ready: true },
  { href: "/admin/edit-time-event", label: "타임 이벤트", description: "time_event 편집", group: "이벤트", ready: true },
  { href: "/admin/edit-limit-event", label: "리밋 이벤트", description: "limit_event 편집", group: "이벤트", ready: true },
  { href: "/admin/dashboard", label: "대시보드", description: "통합 지표 (DAU·RH·광고수익)", group: "통계", ready: true },
  { href: "/admin/event-count", label: "이벤트 카운트", description: "이벤트 집계", group: "통계", ready: true },
  { href: "/admin/count", label: "일별 집계", description: "dayly_total", group: "통계", ready: true },
  { href: "/admin/count-time", label: "독서시간 집계", description: "dayly_total_time", group: "통계", ready: true },
  { href: "/admin/edit-review", label: "리뷰 모더레이션", description: "신고 큐 · 숨김 처리", group: "리뷰/기타", ready: true },
  { href: "/admin/publisher", label: "출판사 통계", description: "출판사별 이벤트 집계", group: "리뷰/기타", ready: true },
];

export const ADMIN_GROUPS: AdminSection["group"][] = [
  "콘텐츠",
  "홈 구성",
  "이벤트",
  "통계",
  "리뷰/기타",
];
