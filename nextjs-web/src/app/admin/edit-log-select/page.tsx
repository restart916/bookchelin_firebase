"use client";

import { useEffect, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  deleteDocAt,
  listDocs,
  updateDocAt,
  type DocRow,
} from "@/lib/admin-db";

interface Category {
  id: string;
  name: string;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function fmtUnix(ts: unknown): string {
  const n = asNumber(ts, 0);
  if (!n) return "";
  const d = new Date(n * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const EMPTY_FORM = {
  logSelectId: "",
  link_url: "",
  title: "",
  description: "",
  hidden: false,
};

export default function AdminEditLogSelectPage() {
  const [items, setItems] = useState<DocRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [i, cat] = await Promise.all([
      listDocs("log_select", { field: "timestamp", dir: "desc" }),
      listDocs("book_category", { field: "id", dir: "desc" }),
    ]);
    setItems(i);
    setCategories(cat.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [i, cat] = await Promise.all([
        listDocs("log_select", { field: "timestamp", dir: "desc" }),
        listDocs("book_category", { field: "id", dir: "desc" }),
      ]);
      if (!active) return;
      setItems(i);
      setCategories(cat.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  function clearInput() {
    setForm({ ...EMPTY_FORM });
  }

  function selectItem(it: DocRow) {
    setForm({
      logSelectId: it.id,
      link_url: asString(it.link_url),
      title: asString(it.title),
      description: asString(it.description),
      hidden: it.hidden === true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveItem() {
    setSaving(true);
    const data: Record<string, unknown> = {
      link_url: form.link_url,
      title: form.title,
      description: form.description,
      hidden: form.hidden,
    };
    try {
      if (form.logSelectId) {
        await updateDocAt("log_select", form.logSelectId, data);
        alert("수정 성공");
      } else {
        await addDocTo("log_select", { timestamp: nowUnix(), ...data });
        alert("추가 성공");
      }
      clearInput();
      await reload();
    } catch (e) {
      console.error(e);
      alert(form.logSelectId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function setHidden(it: DocRow, hidden: boolean) {
    try {
      await updateDocAt("log_select", it.id, { hidden });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, hidden } : x)));
    } catch (e) {
      console.error(e);
      alert("수정 실패");
    }
  }

  async function changeCategory(it: DocRow, category: string) {
    try {
      await updateDocAt("log_select", it.id, { category });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, category } : x)));
      alert(`${asString(it.title)} 수정 성공`);
    } catch {
      alert(`${asString(it.title)} 수정 실패`);
    }
  }

  async function deleteItem(it: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("log_select", it.id);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>로그 셀렉트 관리</h1>
      <p className="admin-sub">
        총 <b>{items.length}</b>개 {loaded ? "" : "(불러오는 중…)"} — log_select_id를 비우고 저장하면 추가, 채워지면 수정.
      </p>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.logSelectId ? "로그 셀렉트 수정" : "새 로그 셀렉트"}</h2>
          {form.logSelectId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.logSelectId && <p className="ad-hint">수정 중: {form.logSelectId}</p>}

        <div className="ad-field">
          <label>link_url</label>
          <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>숨김여부 (체크 시 보이지 않음)</label>
          <label>
            <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} /> 숨기기
          </label>
        </div>
        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={saveItem}>
            {saving ? "저장 중…" : form.logSelectId ? "수정 저장" : "추가"}
          </button>
          {form.logSelectId && (
            <button type="button" onClick={clearInput}>
              취소
            </button>
          )}
        </div>
      </section>

      <table className="ad-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>link_url</th>
            <th>등록일</th>
            <th>카테고리</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{asString(it.title)}</td>
              <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {asString(it.link_url)}
              </td>
              <td>{fmtUnix(it.timestamp)}</td>
              <td>
                <select value={asString(it.category ?? "0")} onChange={(e) => changeCategory(it, e.target.value)}>
                  <option disabled value="0">
                    선택
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <span className={it.hidden ? "ad-badge ad-badge--hidden" : "ad-badge ad-badge--active"}>
                  {it.hidden ? "숨김" : "활성"}
                </span>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectItem(it)}>
                  수정
                </button>{" "}
                {it.hidden ? (
                  <button type="button" onClick={() => setHidden(it, false)}>
                    보여주기
                  </button>
                ) : (
                  <button type="button" onClick={() => setHidden(it, true)}>
                    숨기기
                  </button>
                )}{" "}
                <button type="button" className="ad-danger" onClick={() => deleteItem(it)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "항목이 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
