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
  { href: "/admin/export", label: "책 내보내기", description: "책 목록 export", group: "콘텐츠", ready: true },
  { href: "/admin/edit-banner", label: "배너", description: "배너 관리", group: "홈 구성", ready: false },
  { href: "/admin/edit-main-book", label: "메인/캐러셀", description: "홈 메인북 · 캐러셀 핀", group: "홈 구성", ready: false },
  { href: "/admin/edit-suggest-book", label: "추천 그룹", description: "suggest_group 구성", group: "홈 구성", ready: false },
  { href: "/admin/edit-link-select", label: "링크 셀렉트", description: "link_select 관리", group: "홈 구성", ready: false },
  { href: "/admin/edit-log-select", label: "로그 셀렉트", description: "log_select 관리", group: "홈 구성", ready: false },
  { href: "/admin/edit-time-event", label: "타임 이벤트", description: "time_event 편집", group: "이벤트", ready: false },
  { href: "/admin/edit-limit-event", label: "리밋 이벤트", description: "limit_event 편집", group: "이벤트", ready: false },
  { href: "/admin/event-count", label: "이벤트 카운트", description: "이벤트 집계", group: "통계", ready: false },
  { href: "/admin/count", label: "일별 집계", description: "dayly_total", group: "통계", ready: false },
  { href: "/admin/count-time", label: "독서시간 집계", description: "dayly_total_time", group: "통계", ready: false },
  { href: "/admin/edit-review", label: "리뷰 모더레이션", description: "신고 큐 · 숨김 처리", group: "리뷰/기타", ready: false },
];

export const ADMIN_GROUPS: AdminSection["group"][] = [
  "콘텐츠",
  "홈 구성",
  "이벤트",
  "통계",
  "리뷰/기타",
];
