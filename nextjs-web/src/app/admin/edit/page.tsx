"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  deleteDocAt,
  listDocs,
  updateDocAt,
  uploadToStorage,
  type DocRow,
} from "@/lib/admin-db";

interface Category {
  id: string;
  name: string;
}
interface CatV2 {
  id: string;
  name: string;
}
interface Publisher {
  code: string;
  name: string;
}

const EMPTY_FORM = {
  bookId: "",
  title: "",
  description: "",
  toc: "",
  image_url: "",
  firestore_url: "",
  category: "0",
  category_v2: "",
  publisher: "",
  order: "0",
  hidden: false,
  shop_yes24_link: "",
  shop_bandi_link: "",
  shop_inter_link: "",
};

export default function AdminEditBooksPage() {
  const [books, setBooks] = useState<DocRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catsV2, setCatsV2] = useState<CatV2[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loaded, setLoaded] = useState(false);

  // filters / paging
  const [searchText, setSearchText] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPublisher, setFilterPublisher] = useState("__all");
  const [filterStatus, setFilterStatus] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [b, c, cv2, p] = await Promise.all([
      listDocs("books", { field: "title", dir: "asc" }),
      listDocs("book_category", { field: "id", dir: "desc" }),
      listDocs("book_category_v2", { field: "order", dir: "asc" }),
      listDocs("publisher"),
    ]);
    setBooks(b);
    // book_category is ordered by its `id` field; listDocs surfaces that field
    // as row.id (data fields override the doc id in the spread).
    setCategories(c.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
    setCatsV2(cv2.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
    setPublishers(p.map((d) => ({ code: asString(d["code"]), name: asString(d["name"]) })));
    setLoaded(true);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, c, cv2, p] = await Promise.all([
        listDocs("books", { field: "title", dir: "asc" }),
        listDocs("book_category", { field: "id", dir: "desc" }),
        listDocs("book_category_v2", { field: "order", dir: "asc" }),
        listDocs("publisher"),
      ]);
      if (!active) return;
      setBooks(b);
      setCategories(c.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
      setCatsV2(cv2.map((d) => ({ id: asString(d.id), name: asString(d["name"]) })));
      setPublishers(p.map((d) => ({ code: asString(d["code"]), name: asString(d["name"]) })));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const publisherMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of publishers) m[p.code] = p.name;
    return m;
  }, [publishers]);

  const activeCount = books.filter((b) => b.hidden !== true).length;
  const hiddenCount = books.filter((b) => b.hidden === true).length;

  const filteredBooks = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return books.filter((b) => {
      if (q && !asString(b.title).toLowerCase().includes(q)) return false;
      if (filterCategory && asString(b.category) !== filterCategory) return false;
      if (filterPublisher !== "__all" && asString(b.publisher ?? "") !== filterPublisher) return false;
      if (filterStatus === "active" && b.hidden === true) return false;
      if (filterStatus === "hidden" && b.hidden !== true) return false;
      return true;
    });
  }, [books, searchText, filterCategory, filterPublisher, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const pagedBooks = filteredBooks.slice((page - 1) * pageSize, page * pageSize);

  function publisherName(code: unknown): string {
    const c = asString(code);
    if (!c) return "—";
    return publisherMap[c] ?? c;
  }

  function resetFilters() {
    setSearchText("");
    setFilterCategory("");
    setFilterPublisher("__all");
    setFilterStatus("");
    setCurrentPage(1);
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEpubFile(null);
    setPdfFile(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setEpubFile(null);
    setPdfFile(null);
  }

  function selectBook(b: DocRow) {
    setForm({
      bookId: b.id,
      title: asString(b.title),
      description: asString(b.description),
      toc: asString(b.toc),
      image_url: asString(b.image_url),
      firestore_url: asString(b.firestore_url),
      category: asString(b.category ?? "0"),
      category_v2: asString(b.category_v2 ?? ""),
      publisher: asString(b.publisher ?? ""),
      order: asString(b.order ?? "0"),
      hidden: b.hidden === true,
      shop_yes24_link: asString(b.shop_yes24_link),
      shop_bandi_link: asString(b.shop_bandi_link),
      shop_inter_link: asString(b.shop_inter_link),
    });
    setEpubFile(null);
    setPdfFile(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onChangeBookCategory(b: DocRow, category: string) {
    try {
      await updateDocAt("books", b.id, { category });
      setBooks((prev) => prev.map((x) => (x.id === b.id ? { ...x, category } : x)));
      alert(`${asString(b.title)} 카테고리 수정 성공`);
    } catch {
      alert(`${asString(b.title)} 수정 실패`);
    }
  }

  function buildPayload(includeFilePath: string | null): Record<string, unknown> {
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      toc: form.toc,
      image_url: form.image_url,
      category: form.category,
      category_v2: form.category_v2,
      publisher: form.publisher,
      order: asNumber(form.order),
      hidden: form.hidden,
      shop_yes24_link: form.shop_yes24_link,
      shop_bandi_link: form.shop_bandi_link,
      shop_inter_link: form.shop_inter_link,
    };
    if (includeFilePath) data.firestore_url = includeFilePath;
    return data;
  }

  async function saveBook() {
    if (form.category === "0" || form.category === "") {
      alert("카테고리를 선택해주세요");
      return;
    }
    setSaving(true);
    try {
      let filePath: string | null = null;
      const file = epubFile ?? pdfFile;
      if (file) {
        filePath = (epubFile ? "epub/" : "pdf/") + file.name;
        await uploadToStorage(filePath, file);
      }

      if (form.bookId) {
        await updateDocAt("books", form.bookId, buildPayload(filePath));
        alert("수정 성공");
      } else {
        if (!filePath) {
          alert("파일을 등록해주세요");
          setSaving(false);
          return;
        }
        await addDocTo("books", buildPayload(filePath));
        alert("추가 성공");
      }
      closeForm();
      await reload();
    } catch (e) {
      console.error(e);
      alert(form.bookId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function removeBook(b: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("books", b.id);
      setBooks((prev) => prev.filter((x) => x.id !== b.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>책 관리</h1>
      <p className="admin-sub">
        총 <b>{books.length}</b>권 · 활성 <b>{activeCount}</b> · 숨김 <b>{hiddenCount}</b> — 필터 결과{" "}
        <b>{filteredBooks.length}</b>권 {loaded ? "" : "(불러오는 중…)"}
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
          value={filterCategory}
          onChange={(e) => {
            setFilterCategory(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filterPublisher}
          onChange={(e) => {
            setFilterPublisher(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="__all">전체 출판사</option>
          <option value="">(출판사 없음)</option>
          {publishers.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">전체 상태</option>
          <option value="active">활성만</option>
          <option value="hidden">숨김만</option>
        </select>
        <button type="button" onClick={resetFilters}>
          필터 초기화
        </button>
        <button type="button" className="ad-primary" onClick={openCreate}>
          ＋ 새 책 추가
        </button>
      </div>

      {showForm && (
        <section className="ad-form">
          <div className="ad-form__head">
            <h2>{form.bookId ? "책 수정" : "새 책 추가"}</h2>
            <button type="button" onClick={closeForm}>
              ✕ 닫기
            </button>
          </div>
          {form.bookId && <p className="ad-hint">수정 중: {form.bookId} (파일은 변경 시에만 첨부)</p>}

          <Field label="title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="ad-row">
            <Field label="description">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="table of contents">
              <textarea value={form.toc} onChange={(e) => setForm({ ...form, toc: e.target.value })} />
            </Field>
          </div>
          <Field label="image_url">
            <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </Field>
          <Field label="순서 (숫자)">
            <input value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
          </Field>
          <div className="ad-row">
            <Field label="shop_yes24_link">
              <input value={form.shop_yes24_link} onChange={(e) => setForm({ ...form, shop_yes24_link: e.target.value })} />
            </Field>
            <Field label="shop_kyobo_link">
              <input value={form.shop_bandi_link} onChange={(e) => setForm({ ...form, shop_bandi_link: e.target.value })} />
            </Field>
            <Field label="shop_inter_link">
              <input value={form.shop_inter_link} onChange={(e) => setForm({ ...form, shop_inter_link: e.target.value })} />
            </Field>
          </div>
          <div className="ad-row">
            <Field label="카테고리 (필수)">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option disabled value="0">
                  선택해주세요
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="카테고리 v2 (optional)">
              <select value={form.category_v2} onChange={(e) => setForm({ ...form, category_v2: e.target.value })}>
                <option value="">선택 없음</option>
                {catsV2.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="출판사 (optional)">
              <select value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })}>
                <option value="">선택 없음</option>
                {publishers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="숨김여부">
              <label>
                <input
                  type="checkbox"
                  checked={form.hidden}
                  onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
                />{" "}
                숨기기
              </label>
            </Field>
          </div>
          <div className="ad-row">
            <Field label="epub_file">
              <input type="file" onChange={(e) => setEpubFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="pdf_file">
              <input type="file" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          <div className="ad-form__actions">
            <button type="button" className="ad-primary" disabled={saving} onClick={saveBook}>
              {saving ? "저장 중…" : form.bookId ? "수정 저장" : "추가"}
            </button>
            <button type="button" onClick={closeForm}>
              취소
            </button>
          </div>
        </section>
      )}

      <table className="ad-table">
        <thead>
          <tr>
            <th />
            <th>제목</th>
            <th>카테고리</th>
            <th>출판사</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {pagedBooks.map((b) => (
            <tr key={b.id}>
              <td>
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asString(b.image_url)} referrerPolicy="no-referrer" alt="" width={36} height={50} style={{ objectFit: "cover", borderRadius: 3 }} />
                ) : null}
              </td>
              <td>{asString(b.title)}</td>
              <td>
                <select value={asString(b.category ?? "0")} onChange={(e) => onChangeBookCategory(b, e.target.value)}>
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
              <td>{publisherName(b.publisher)}</td>
              <td>
                <span className={b.hidden ? "ad-badge ad-badge--hidden" : "ad-badge ad-badge--active"}>
                  {b.hidden ? "숨김" : "활성"}
                </span>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectBook(b)}>
                  수정
                </button>{" "}
                <button type="button" className="ad-danger" onClick={() => removeBook(b)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {pagedBooks.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "조건에 맞는 책이 없습니다." : "불러오는 중…"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ad-field">
      <label>{label}</label>
      {children}
    </div>
  );
}
