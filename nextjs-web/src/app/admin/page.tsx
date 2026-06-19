import Link from "next/link";

import { ADMIN_GROUPS, ADMIN_SECTIONS } from "@/lib/admin-nav";

export const dynamic = "force-dynamic";

export default function AdminDashboard() {
  return (
    <div className="admin-content">
      <h1>대시보드</h1>
      <p className="admin-sub">관리 섹션을 선택하세요. “준비중”은 Next.js 이전 작업 중입니다.</p>

      {ADMIN_GROUPS.map((group) => {
        const items = ADMIN_SECTIONS.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 14, color: "#6b7280", margin: "0 0 12px" }}>{group}</h2>
            <div className="admin-cards">
              {items.map((s) =>
                s.ready ? (
                  <Link key={s.href} href={s.href} className="admin-card">
                    <strong>{s.label}</strong>
                    <span>{s.description}</span>
                  </Link>
                ) : (
                  <div key={s.href} className="admin-card is-soon">
                    <strong>{s.label}</strong>
                    <span>{s.description} · 준비중</span>
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
