"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { listDocsPaginated } from "@/lib/admin-db";

export default function AdminPublisherPage() {
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
        setError("일치하는 출판사를 찾을 수 없습니다.");
        return;
      }
      router.push(`/admin/publisher/detail/${result.docs[0].id}`);
    } catch (e) {
      setError("오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-center">
      <div className="admin-login-card">
        <h1>출판사 조회</h1>
        <p>출판사 코드를 입력해 주세요.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            placeholder="출판사 코드"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
          />
          <button type="submit" disabled={loading || !code.trim()}>
            {loading ? "조회 중…" : "조회"}
          </button>
          {error && <p className="admin-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
