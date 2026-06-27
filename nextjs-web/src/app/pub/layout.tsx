import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "북슐랭 출판사 통계",
};

// Standalone layout — no admin sidebar or AdminGate.
// Publisher users access this with their code only.
export default function PublisherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9", color: "#1f2329", fontSize: 14 }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e6e8eb",
          padding: "12px 28px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16, color: "#d23669" }}>북슐랭</span>
        <span style={{ color: "#aaa", fontSize: 13 }}>출판사 통계</span>
      </header>
      <main style={{ padding: "40px 28px", maxWidth: 1100, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
