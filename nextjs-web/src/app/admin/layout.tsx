import type { Metadata } from "next";
import Link from "next/link";

import { AdminGate } from "@/components/admin/admin-gate";
import { ADMIN_GROUPS, ADMIN_SECTIONS } from "@/lib/admin-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "북슐랭 어드민",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand">
          북슐랭 어드민
        </Link>
        {ADMIN_GROUPS.map((group) => (
          <div key={group} className="admin-navgroup">
            <h3>{group}</h3>
            <ul>
              {ADMIN_SECTIONS.filter((s) => s.group === group).map((s) => (
                <li key={s.href}>
                  <Link href={s.ready ? s.href : "/admin"} aria-disabled={!s.ready}>
                    {s.label}
                    {!s.ready && <span className="admin-soon">준비중</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
      <main className="admin-main">
        <AdminGate>{children}</AdminGate>
      </main>
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
    </div>
  );
}

const ADMIN_CSS = `
.admin-shell { position: fixed; inset: 0; z-index: 9990; display: flex; background: #f6f7f9; color: #1f2329; font-size: 14px; }
.admin-sidebar { width: 230px; flex: 0 0 230px; background: #1f2329; color: #cdd2da; overflow-y: auto; padding: 16px 0; }
.admin-brand { display: block; padding: 8px 20px 16px; color: #fff; font-weight: 700; font-size: 16px; text-decoration: none; }
.admin-navgroup { padding: 6px 0; }
.admin-navgroup h3 { margin: 0; padding: 8px 20px 4px; font-size: 11px; letter-spacing: .04em; color: #7c8493; text-transform: uppercase; }
.admin-navgroup ul { list-style: none; margin: 0; padding: 0; }
.admin-navgroup a { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; color: #cdd2da; text-decoration: none; }
.admin-navgroup a:hover { background: #2a2f37; color: #fff; }
.admin-navgroup a[aria-disabled="true"] { color: #6b7280; cursor: default; }
.admin-soon { font-size: 10px; background: #3a3f49; color: #9aa3b0; border-radius: 8px; padding: 1px 6px; }
.admin-main { flex: 1 1 auto; overflow-y: auto; }
.admin-userbar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 8px 20px; background: #fff; border-bottom: 1px solid #e6e8eb; font-size: 13px; color: #555; }
.admin-userbar button { background: none; border: 1px solid #d0d4da; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.admin-center { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 40px; }
.admin-login-card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 40px 36px; box-shadow: 0 4px 20px rgba(0,0,0,.06); max-width: 360px; text-align: center; background: #fff; }
.admin-login-card h1 { font-size: 20px; margin: 0 0 8px; color: #d23669; }
.admin-login-card p { color: #777; margin: 0 0 24px; }
.admin-login-card > button { width: 100%; padding: 12px 18px; border: 1px solid #d23669; border-radius: 24px; background: #d23669; color: #fff; font-weight: 700; cursor: pointer; }
.admin-login-card > button:disabled { opacity: .6; cursor: default; }
.admin-error { color: #c0392b; font-size: 13px; margin-top: 16px; }
.admin-link { background: none; border: none; color: #d23669; text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; }
.admin-content { padding: 24px 28px; }
.admin-content h1 { margin: 0 0 4px; font-size: 22px; }
.admin-content .admin-sub { color: #6b7280; margin: 0 0 24px; }
.admin-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.admin-card { display: block; background: #fff; border: 1px solid #e6e8eb; border-radius: 10px; padding: 16px; text-decoration: none; color: inherit; }
.admin-card:hover { border-color: #d23669; }
.admin-card.is-soon { opacity: .55; }
.admin-card strong { display: block; font-size: 15px; margin-bottom: 4px; }
.admin-card span { color: #6b7280; font-size: 12px; }

.ad-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.ad-filters input, .ad-filters select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; }
.ad-filters input { min-width: 200px; }
.ad-filters button, .ad-pager button { padding: 6px 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; }
.ad-primary { background: #d23669 !important; color: #fff; border: none !important; font-weight: 700; }
.ad-danger { color: #c0392b; border-color: #e2b6b1; }
button:disabled { opacity: .4; cursor: default; }
.ad-form { background: #fff; border: 2px solid #d23669; border-radius: 8px; padding: 16px; margin-bottom: 18px; }
.ad-form__head { display: flex; justify-content: space-between; align-items: center; }
.ad-form__head h2 { margin: 0; font-size: 17px; }
.ad-form__head button { background: none; border: none; cursor: pointer; color: #888; }
.ad-hint { color: #888; font-size: 12px; margin: 6px 0; }
.ad-field { margin: 8px 0; text-align: left; flex: 1; }
.ad-field > label { display: block; font-size: 12px; color: #666; margin-bottom: 3px; }
.ad-field input[type=text], .ad-field input:not([type]), .ad-field input[type=file], .ad-field textarea, .ad-field select { width: 100%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
.ad-field textarea { height: 110px; }
.ad-row { display: flex; gap: 10px; }
.ad-form__actions { margin-top: 12px; display: flex; gap: 8px; }
.ad-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
.ad-table th, .ad-table td { border-bottom: 1px solid #eee; padding: 8px 6px; text-align: left; vertical-align: middle; }
.ad-table th { background: #f7f7f8; color: #555; font-weight: 600; }
.ad-table select { padding: 4px; border: 1px solid #ccc; border-radius: 4px; max-width: 130px; }
.ad-table button { padding: 4px 9px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 0 1px; }
.ad-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.ad-badge--active { background: #e3f6ef; color: #01875f; }
.ad-badge--hidden { background: #eee; color: #999; }
.ad-pager { display: flex; align-items: center; gap: 8px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
.ad-pager select { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
`;
