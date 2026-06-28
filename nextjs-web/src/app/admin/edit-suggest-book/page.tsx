"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDocTo,
  asString,
  deleteDocAt,
  listDocs,
  updateDocAt,
  type DocRow,
} from "@/lib/admin-db";

const EMPTY_FORM = {
  suggestId: "",
  title: "",
  order: "0",
};

export default function AdminEditSuggestBookPage() {
  const [books, setBooks] = useState<DocRow[]>([]);
  const [groups, setGroups] = useState<DocRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [bookIdInput, setBookIdInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function reloadGroups() {
    const g = await listDocs("suggest_group", { field: "order", dir: "asc" });
    // _auto_*(지금 인기/오늘의 발견 자동 미러)는 앱이 안 읽고 매일 덮어써짐 → 여기선 숨김.
    // 그 두 줄은 "지금 인기·오늘의 발견" 메뉴에서 관리.
    setGroups(g.filter((d) => d.auto !== true && !asString(d.id).startsWith("_auto")));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, g] = await Promise.all([listDocs("books"), listDocs("suggest_group", { field: "order", dir: "asc" })]);
      if (!active) return;
      setBooks(b);
      // _auto_*(지금 인기/오늘의 발견 자동 미러)는 앱이 안 읽고 매일 덮어써짐 → 여기선 숨김.
    // 그 두 줄은 "지금 인기·오늘의 발견" 메뉴에서 관리.
    setGroups(g.filter((d) => d.auto !== true && !asString(d.id).startsWith("_auto")));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const bookMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of books) m[b.id] = asString(b.title);
    return m;
  }, [books]);

  function getBookName(id: string): string {
    return bookMap[id] ?? "";
  }

  function clearInput() {
    setForm({ ...EMPTY_FORM });
    setBookIds([]);
    setBookIdInput("");
  }

  function addBookId() {
    const id = bookIdInput.trim();
    if (!id) return;
    setBookIds((prev) => [...prev, id]);
    setBookIdInput("");
  }

  function removeBookId(index: number) {
    setBookIds((prev) => prev.filter((_, i) => i !== index));
  }

  function selectGroup(g: DocRow) {
    setForm({
      suggestId: g.id,
      title: asString(g.title),
      order: asString(g.order ?? "0"),
    });
    setBookIds(Array.isArray(g.books) ? (g.books as unknown[]).map((x) => asString(x)) : []);
    setBookIdInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveGroup() {
    setSaving(true);
    const data: Record<string, unknown> = {
      title: form.title,
      books: bookIds,
      // order 는 문자열로 저장한다(앱·기존 데이터가 문자열 사전순 정렬). 숫자로 저장하면
      // Firestore 타입 정렬상 숫자가 문자열보다 앞서서 그룹이 맨 위로 튄다.
      order: String(form.order ?? "").trim() || "0",
    };
    try {
      if (form.suggestId) {
        await updateDocAt("suggest_group", form.suggestId, data);
        alert("수정 성공");
      } else {
        await addDocTo("suggest_group", data);
        alert("추가 성공");
      }
      clearInput();
      await reloadGroups();
    } catch (e) {
      console.error(e);
      alert(form.suggestId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(g: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("suggest_group", g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>추천 그룹 관리</h1>
      <p className="admin-sub">
        총 <b>{groups.length}</b>개 {loaded ? "" : "(불러오는 중…)"} — suggest_group_id를 비우고 저장하면 추가, 채워지면 수정.
      </p>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.suggestId ? "추천 그룹 수정" : "새 추천 그룹"}</h2>
          {form.suggestId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.suggestId && <p className="ad-hint">수정 중: {form.suggestId}</p>}

        <div className="ad-field">
          <label>title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>순서 (숫자)</label>
          <input value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
        </div>

        <div className="ad-field">
          <label>book id 목록 ({bookIds.length}권)</label>
          <table className="ad-table" style={{ marginBottom: 8 }}>
            <tbody>
              {bookIds.map((id, index) => (
                <tr key={`${id}-${index}`}>
                  <td style={{ width: 220, fontFamily: "monospace" }}>{id}</td>
                  <td>{getBookName(id) || <span style={{ color: "#c0392b" }}>(없는 책)</span>}</td>
                  <td style={{ width: 60 }}>
                    <button type="button" className="ad-danger" onClick={() => removeBookId(index)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {bookIds.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "#aaa", textAlign: "center", padding: 16 }}>
                    추가된 책이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={bookIdInput}
              onChange={(e) => setBookIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBookId();
                }
              }}
              placeholder="book id 입력"
            />
            <button type="button" onClick={addBookId}>
              책 추가
            </button>
          </div>
          {bookIdInput.trim() && (
            <p className="ad-hint">미리보기: {getBookName(bookIdInput.trim()) || "(매칭되는 책 없음)"}</p>
          )}
        </div>

        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={saveGroup}>
            {saving ? "저장 중…" : form.suggestId ? "수정 저장" : "추가"}
          </button>
          {form.suggestId && (
            <button type="button" onClick={clearInput}>
              취소
            </button>
          )}
        </div>
      </section>

      <table className="ad-table">
        <thead>
          <tr>
            <th>title</th>
            <th>순서</th>
            <th>책 수</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>{asString(g.title)}</td>
              <td>{asString(g.order)}</td>
              <td>{Array.isArray(g.books) ? (g.books as unknown[]).length : 0}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectGroup(g)}>
                  수정
                </button>{" "}
                <button type="button" className="ad-danger" onClick={() => deleteGroup(g)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "추천 그룹이 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
