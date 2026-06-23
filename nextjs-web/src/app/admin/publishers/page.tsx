"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  deleteDocAt,
  listDocs,
  listDocsPaginated,
  updateDocAt,
  type DocRow,
} from "@/lib/admin-db";

interface Publisher {
  docId: string;
  name: string;
  code: string;
  bookCount: number | null; // null = 미조회
}

const EMPTY_FORM = { docId: "", name: "", code: "" };

function toPublisher(d: DocRow): Publisher {
  return {
    docId: d.id,
    name: asString(d.name || d.publisher_name),
    code: asString(d.code),
    bookCount: null,
  };
}

export default function AdminPublishersPage() {
  const router = useRouter();
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const docs = await listDocs("publisher", { field: "name", dir: "asc" });
      setPublishers(docs.map(toPublisher));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    reload().then(() => { if (!active) return; });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 소속 책 수 lazy 조회: 테이블이 렌더된 뒤 순차적으로 채운다
  useEffect(() => {
    if (publishers.length === 0) return;
    let active = true;
    (async () => {
      for (const pub of publishers) {
        if (!active) break;
        if (pub.bookCount !== null || !pub.code) continue;
        try {
          const result = await listDocsPaginated("books", {
            pageSize: 1,
            whereClauses: [["publisher", "==", pub.code]],
          });
          // 정확한 count가 필요하면 전체 조회 필요하나, 여기선 "있음/없음" + 대략 수
          // 간단히 pageSize=200으로 재조회
          const all = await listDocsPaginated("books", {
            pageSize: 200,
            whereClauses: [["publisher", "==", pub.code]],
          });
          if (!active) break;
          setPublishers((prev) =>
            prev.map((p) =>
              p.docId === pub.docId ? { ...p, bookCount: all.docs.length } : p,
            ),
          );
        } catch {
          // 조회 실패 시 무시 (optional 필드)
        }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishers.map((p) => p.docId).join(",")]);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(p: Publisher) {
    setForm({ docId: p.docId, name: p.name, code: p.code });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  }

  async function save() {
    const name = form.name.trim();
    const code = form.code.trim();
    if (!name || !code) {
      alert("출판사명과 코드(로그인 비번)는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (form.docId) {
        await updateDocAt("publisher", form.docId, { name, code });
      } else {
        await addDocTo("publisher", { name, code });
      }
      closeForm();
      await reload();
    } catch (e) {
      alert("저장 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Publisher) {
    const bookCount = p.bookCount ?? 0;
    const warnBook =
      bookCount > 0
        ? `\n⚠️ 이 출판사 코드로 등록된 책이 ${bookCount}권 있습니다. 책의 publisher 필드는 자동 삭제되지 않습니다.`
        : "";
    if (!confirm(`"${p.name}" 출판사를 삭제하시겠습니까?${warnBook}`)) return;
    try {
      await deleteDocAt("publisher", p.docId);
      setPublishers((prev) => prev.filter((x) => x.docId !== p.docId));
    } catch (e) {
      alert("삭제 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const isNew = !form.docId;

  return (
    <div className="admin-content">
      <h1>출판사 관리</h1>
      <p className="admin-sub">
        publisher 컬렉션 CRUD. code = 출판사 통계 로그인 비번.{" "}
        <span style={{ color: "#4a7cf4" }}>
          "통계 바로보기"를 클릭하면 코드 입력 없이 통계 페이지로 이동합니다.
        </span>
      </p>

      <div className="ad-filters">
        <button type="button" className="ad-primary" onClick={openCreate}>
          ＋ 출판사 추가
        </button>
        <span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>
          {loading ? "불러오는 중…" : `${publishers.length}개`}
        </span>
      </div>

      {showForm && (
        <section className="ad-form">
          <div className="ad-form__head">
            <h2>{isNew ? "새 출판사 추가" : `수정: ${form.name}`}</h2>
            <button type="button" onClick={closeForm}>✕ 닫기</button>
          </div>
          <div className="ad-row">
            <div className="ad-field">
              <label>출판사명 (필수)</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 한빛미디어"
              />
            </div>
            <div className="ad-field">
              <label>코드 (필수 · 출판사 로그인 비번)</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="예: hanbit2024"
                autoComplete="off"
              />
              <span className="ad-hint">
                출판사가 /pub 에서 이 코드를 입력해 통계를 확인합니다.
              </span>
            </div>
          </div>
          <div className="ad-form__actions">
            <button type="button" className="ad-primary" disabled={saving} onClick={save}>
              {saving ? "저장 중…" : isNew ? "추가" : "수정 저장"}
            </button>
            <button type="button" onClick={closeForm}>취소</button>
          </div>
        </section>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th>출판사명</th>
              <th>코드 (로그인 비번)</th>
              <th style={{ width: 70, textAlign: "right" }}>소속 책</th>
              <th style={{ width: 220 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {publishers.map((p) => (
              <tr key={p.docId}>
                <td><strong>{p.name || "—"}</strong></td>
                <td>
                  <code
                    style={{
                      background: "#f4f4f5",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  >
                    {p.code}
                  </code>
                </td>
                <td style={{ textAlign: "right" }}>
                  {p.bookCount === null ? (
                    <span style={{ color: "#bbb", fontSize: 11 }}>…</span>
                  ) : (
                    p.bookCount
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => openEdit(p)}>수정</button>
                  <button
                    type="button"
                    onClick={() => router.push(`/pub/${p.docId}`)}
                    title="어드민용 — 코드 입력 없이 통계 바로보기"
                    style={{ color: "#4a7cf4", borderColor: "#c7d7f7" }}
                  >
                    통계 바로보기
                  </button>
                  <button
                    type="button"
                    className="ad-danger"
                    onClick={() => remove(p)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {!loading && publishers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", color: "#aaa", padding: "30px 0" }}
                >
                  출판사 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: "14px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, color: "#92400e" }}>
        <strong>출판사 접근 안내</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>출판사 자체 접근 URL: <code>/pub</code> (코드 입력 → 통계 조회)</li>
          <li>어드민 바로보기: "통계 바로보기" 버튼 클릭 → <code>/pub/{"{docId}"}</code> 직행</li>
          <li>코드는 URL에 노출되지 않습니다 (Firestore doc ID만 사용).</li>
        </ul>
      </div>
    </div>
  );
}
