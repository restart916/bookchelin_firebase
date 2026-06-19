import type { Metadata } from "next";

import {
  COMMUNITY_GUIDELINE_SECTIONS,
  COMMUNITY_POLICY_VERSION,
} from "@/lib/community-guidelines";

export const metadata: Metadata = {
  title: "커뮤니티 가이드라인",
  description: "북슐랭 독자 리뷰 작성, 신고, 차단 및 운영 기준입니다.",
  alternates: { canonical: "/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return (
    <article className="policy container">
      <header>
        <span className="eyebrow">COMMUNITY</span>
        <h1>커뮤니티 가이드라인</h1>
        <p>정책 버전 {COMMUNITY_POLICY_VERSION}</p>
      </header>
      <p className="policy__lead">
        북슐랭은 누구나 안심하고 책에 대한 생각을 나눌 수 있는 공간을 지향합니다.
      </p>
      {COMMUNITY_GUIDELINE_SECTIONS.map((section, index) => (
        <section key={section}>
          <h2>{index + 1}. {[
            "리뷰 공개 범위",
            "금지 콘텐츠",
            "스팸과 조작",
            "검토와 제재",
            "신고와 차단",
            "문의",
          ][index]}</h2>
          <p>{section}</p>
        </section>
      ))}
    </article>
  );
}
