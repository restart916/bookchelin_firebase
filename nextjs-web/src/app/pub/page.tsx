"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { listDocsPaginated } from "@/lib/admin-db";

export default function PublisherLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const result = await listDocsPaginated("publisher", {
        pageSize: 5,
        whereClauses: [["code", "==", trimmed]],
      });
      if (result.docs.length === 0) {
        setError("일치하는 출판사 코드를 찾을 수 없습니다.");
        return;
      }
      router.push(`/pub/${result.docs[0].id}`);
    } catch (e) {
      setError("오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: "40px 36px",
          boxShadow: "0 4px 20px rgba(0,0,0,.06)",
          maxWidth: 360,
          width: "100%",
          background: "#fff",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#d23669" }}>출판사 통계 조회</h1>
        <p style={{ color: "#777", margin: "0 0 24px" }}>출판사 코드를 입력해 주세요.</p>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            type="text"
            placeholder="출판사 코드"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              padding: "12px 18px",
              border: "none",
              borderRadius: 24,
              background: "#d23669",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading || !code.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "조회 중…" : "조회"}
          </button>
          {error && (
            <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
