"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  countDocs,
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
  linkSelectId: "",
  image_url: "",
  link_url: "",
  title: "",
  description: "",
  hidden: false,
};

export default function AdminEditLinkSelectPage() {
  const [items, setItems] = useState<DocRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  // filters / paging
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("active"); // default: 활성만
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // click counts loaded lazily per visible page (avoids scanning the whole
  // link_select_click log on every page load).
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});
  const clickCountsRef = useRef<Record<string, number>>({});

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [i, cat] = await Promise.all([
      listDocs("link_select", { field: "timestamp", dir: "desc" }),
      listDocs("book_category", { field: "id", dir: "desc" }),
    ]);
    setItems(i);
    setCategories(cat.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [i, cat] = await Promise.all([
        listDocs("link_select", { field: "timestamp", dir: "desc" }),
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

  const activeCount = items.filter((i) => i.hidden !== true).length;
  const hiddenCount = items.filter((i) => i.hidden === true).length;

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !asString(it.title).toLowerCase().includes(q)) return false;
      if (filterStatus === "active" && it.hidden === true) return false;
      if (filterStatus === "hidden" && it.hidden !== true) return false;
      return true;
    });
  }, [items, searchText, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // Lazily fetch click counts for the rows currently on screen (cached).
  const pageKey = paged.map((p) => p.id).join(",");
  useEffect(() => {
    let active = true;
    const missing = paged.map((p) => p.id).filter((id) => clickCountsRef.current[id] === undefined);
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(
          async (id) =>
            [id, await countDocs("link_select_click", { field: "link_select_id", value: id })] as const,
        ),
      );
      if (!active) return;
      for (const [id, c] of entries) clickCountsRef.current[id] = c;
      setClickCounts({ ...clickCountsRef.current });
    })();
    return () => {
      active = false;
    };
    // pageKey captures the visible rows; counts are cached in the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  function clearInput() {
    setForm({ ...EMPTY_FORM });
  }

  function selectItem(it: DocRow) {
    setForm({
      linkSelectId: it.id,
      image_url: asString(it.image_url),
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
      image_url: form.image_url,
      link_url: form.link_url,
      title: form.title,
      description: form.description,
      hidden: form.hidden,
    };
    try {
      if (form.linkSelectId) {
        await updateDocAt("link_select", form.linkSelectId, data);
        alert("수정 성공");
      } else {
        await addDocTo("link_select", { timestamp: nowUnix(), ...data });
        alert("추가 성공");
      }
      clearInput();
      await reload();
    } catch (e) {
      console.error(e);
      alert(form.linkSelectId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function setHidden(it: DocRow, hidden: boolean) {
    try {
      await updateDocAt("link_select", it.id, { hidden });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, hidden } : x)));
    } catch (e) {
      console.error(e);
      alert("수정 실패");
    }
  }

  async function changeCategory(it: DocRow, category: string) {
    try {
      await updateDocAt("link_select", it.id, { category });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, category } : x)));
      alert(`${asString(it.title)} 수정 성공`);
    } catch {
      alert(`${asString(it.title)} 수정 실패`);
    }
  }

  async function deleteItem(it: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("link_select", it.id);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>링크 셀렉트 관리</h1>
      <p className="admin-sub">
        총 <b>{items.length}</b>개 · 활성 <b>{activeCount}</b> · 숨김 <b>{hiddenCount}</b> — 필터 결과{" "}
        <b>{filtered.length}</b>개 {loaded ? "" : "(불러오는 중…)"}
      </p>

      <div className="ad-filters">
        <input
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="제목 검색"
        />
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="active">활성만</option>
          <option value="hidden">숨김만</option>
          <option value="">전체</option>
        </select>
      </div>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.linkSelectId ? "링크 셀렉트 수정" : "새 링크 셀렉트"}</h2>
          {form.linkSelectId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.linkSelectId && <p className="ad-hint">수정 중: {form.linkSelectId}</p>}

        <div className="ad-row">
          <div className="ad-field">
            <label>image_url</label>
            <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </div>
          <div className="ad-field">
            <label>link_url</label>
            <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
          </div>
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
          <label>숨김여부 (체크 시 NewMain에서 보이지 않음)</label>
          <label>
            <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} /> 숨기기
          </label>
        </div>
        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={saveItem}>
            {saving ? "저장 중…" : form.linkSelectId ? "수정 저장" : "추가"}
          </button>
          {form.linkSelectId && (
            <button type="button" onClick={clearInput}>
              취소
            </button>
          )}
        </div>
      </section>

      <table className="ad-table">
        <thead>
          <tr>
            <th>이미지</th>
            <th>제목</th>
            <th>클릭수</th>
            <th>등록일</th>
            <th>카테고리</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((it) => (
            <tr key={it.id}>
              <td>
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asString(it.image_url)} referrerPolicy="no-referrer" alt="" style={{ height: 50 }} />
                ) : null}
              </td>
              <td>{asString(it.title)}</td>
              <td>{clickCounts[it.id] ?? "…"}</td>
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
          {paged.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "조건에 맞는 항목이 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="ad-pager">
        <span>페이지당</span>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" disabled={page <= 1} onClick={() => setCurrentPage(1)}>
          « 처음
        </button>
        <button type="button" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)}>
          ‹ 이전
        </button>
        <span>
          {page} / {totalPages} 페이지
        </span>
        <button type="button" disabled={page >= totalPages} onClick={() => setCurrentPage(page + 1)}>
          다음 ›
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => setCurrentPage(totalPages)}>
          끝 »
        </button>
      </div>
    </div>
  );
}
