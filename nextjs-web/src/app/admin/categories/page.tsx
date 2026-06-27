"use client";

import { useEffect, useState } from "react";

import {
  asNumber,
  asString,
  deleteDocAt,
  listDocs,
  listDocsPaginated,
  setDocAt,
  updateDocAt,
  uploadToStorage,
} from "@/lib/admin-db";

interface V2Cat {
  docId: string;   // Firestore doc ID (= id field for all v2 docs)
  id: string;
  name: string;
  order: number;
  icon_url: string;
  description: string;
  hidden: boolean;
}

// id "1"~"6" = legacy 카테고리. 아이콘 업로드 시 book_category 에도 동기화.
const LEGACY_IDS = new Set(["1", "2", "3", "4", "5", "6"]);

const EMPTY_FORM = {
  docId: "",      // 비어있으면 신규 생성
  id: "",
  name: "",
  order: 99,
  icon_url: "",
  description: "",
  hidden: false,
};

function toCat(d: { id: string; [k: string]: unknown }): V2Cat {
  return {
    docId: d.id,
    id: asString(d.id),
    name: asString(d.name),
    order: asNumber(d.order),
    icon_url: asString(d.icon_url),
    description: asString(d.description),
    hidden: d.hidden === true,
  };
}

export default function AdminCategoriesPage() {
  const [cats, setCats] = useState<V2Cat[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const docs = await listDocs("book_category_v2", { field: "order", dir: "asc" });
      setCats(docs.map(toCat));
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

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setIconFile(null);
    setShowForm(true);
  }

  function openEdit(c: V2Cat) {
    setForm({
      docId: c.docId,
      id: c.id,
      name: c.name,
      order: c.order,
      icon_url: c.icon_url,
      description: c.description,
      hidden: c.hidden,
    });
    setIconFile(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setIconFile(null);
  }

  async function save() {
    const id = form.id.trim();
    const name = form.name.trim();
    if (!id || !name) {
      alert("id와 카테고리명은 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      let iconUrl = form.icon_url;

      if (iconFile) {
        const ext = iconFile.name.split(".").pop() ?? "png";
        const storagePath = `category-icons/${id}.${ext}`;
        iconUrl = await uploadToStorage(storagePath, iconFile);
      }

      const data: Record<string, unknown> = {
        id,
        name,
        order: Number(form.order),
        icon_url: iconUrl,
        description: form.description.trim(),
        hidden: form.hidden,
      };

      // 신규면 merge=false (완전 overwrite), 수정도 동일
      await setDocAt("book_category_v2", id, data, false);

      // 레거시 id("1"~"6")이면 book_category에도 icon_url 동기화
      if (iconUrl && LEGACY_IDS.has(id)) {
        const result = await listDocsPaginated("book_category", {
          pageSize: 3,
          whereClauses: [["id", "==", id]],
        });
        if (result.docs.length > 0) {
          await updateDocAt("book_category", result.docs[0].id, { icon_url: iconUrl });
        }
      }

      closeForm();
      await reload();
    } catch (e) {
      console.error("저장 실패", e);
      alert("저장 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function toggleHidden(c: V2Cat) {
    try {
      await updateDocAt("book_category_v2", c.docId, { hidden: !c.hidden });
      setCats((prev) =>
        prev.map((x) => (x.docId === c.docId ? { ...x, hidden: !c.hidden } : x)),
      );
    } catch (e) {
      alert("수정 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function remove(c: V2Cat) {
    const warn = LEGACY_IDS.has(c.id)
      ? `⚠️ "${c.name}"(id:${c.id})은 레거시 카테고리입니다. book_category_v2에서만 삭제되며 book_category는 유지됩니다. 계속하시겠습니까?`
      : `"${c.name}" 카테고리를 삭제하시겠습니까?`;
    if (!confirm(warn)) return;
    try {
      await deleteDocAt("book_category_v2", c.docId);
      setCats((prev) => prev.filter((x) => x.docId !== c.docId));
    } catch (e) {
      alert("삭제 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const isNew = !form.docId;

  return (
    <div className="admin-content">
      <h1>카테고리 관리 (v2)</h1>
      <p className="admin-sub">
        book_category_v2 CRUD. 레거시 book_category(구앱용)는 절대 수정하지 않음.
        아이콘 업로드 시 id "1"~"6"은 book_category에도 icon_url 동기화.
      </p>

      <div className="ad-filters">
        <button type="button" className="ad-primary" onClick={openCreate}>
          ＋ 새 카테고리
        </button>
        <span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>
          {loading ? "불러오는 중…" : `${cats.length}개`}
        </span>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <section className="ad-form">
          <div className="ad-form__head">
            <h2>{isNew ? "새 카테고리 추가" : `수정: ${form.name}`}</h2>
            <button type="button" onClick={closeForm}>✕ 닫기</button>
          </div>
          {!isNew && LEGACY_IDS.has(form.id) && (
            <p className="ad-hint" style={{ color: "#f59e0b" }}>
              ⚠️ 레거시 카테고리 (id:{form.id}). id·order 변경 금지. 아이콘 업로드 시 book_category에도 동기화됩니다.
            </p>
          )}

          <div className="ad-row">
            <div className="ad-field">
              <label>id (필수, 신규 후 변경 불가)</label>
              <input
                value={form.id}
                readOnly={!isNew}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder={'예: "7" 또는 "science"'}
                style={!isNew ? { background: "#f5f5f5", color: "#888" } : undefined}
              />
            </div>
            <div className="ad-field">
              <label>카테고리명 (필수)</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="ad-field">
              <label>order (숫자, 오름차순 정렬)</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="ad-row">
            <div className="ad-field">
              <label>아이콘 이미지 업로드 (Storage → icon_url)</label>
              {form.icon_url && (
                <div style={{ marginBottom: 6 }}>
                  <img
                    src={form.icon_url}
                    alt="현재 아이콘"
                    width={40}
                    height={40}
                    style={{ objectFit: "contain", border: "1px solid #eee", borderRadius: 4 }}
                  />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>현재 아이콘</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
              />
              {iconFile && (
                <span style={{ fontSize: 11, color: "#4a7cf4" }}>{iconFile.name} 업로드 예정</span>
              )}
            </div>
            <div className="ad-field">
              <label>description (옵션)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="웹 SEO 설명 등"
              />
            </div>
            <div className="ad-field">
              <label>숨김</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={form.hidden}
                  onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
                />
                숨김 (신앱·웹 노출 제외)
              </label>
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

      {/* Category list */}
      <div style={{ overflowX: "auto" }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>순서</th>
              <th style={{ width: 48 }}>아이콘</th>
              <th>카테고리명</th>
              <th style={{ width: 60 }}>id</th>
              <th style={{ width: 60 }}>상태</th>
              <th style={{ width: 60 }}>레거시</th>
              <th style={{ width: 140 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.docId} style={c.hidden ? { opacity: 0.5 } : undefined}>
                <td style={{ textAlign: "center" }}>{c.order}</td>
                <td style={{ textAlign: "center" }}>
                  {c.icon_url ? (
                    <img
                      src={c.icon_url}
                      alt={c.name}
                      width={32}
                      height={32}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: 10, color: "#bbb" }}>없음</span>
                  )}
                </td>
                <td>
                  <strong>{c.name}</strong>
                  {c.description && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>{c.description}</span>
                  )}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.id}</td>
                <td>
                  <span
                    className={`ad-badge ${c.hidden ? "ad-badge--hidden" : "ad-badge--active"}`}
                  >
                    {c.hidden ? "숨김" : "표시"}
                  </span>
                </td>
                <td style={{ textAlign: "center", fontSize: 12 }}>
                  {LEGACY_IDS.has(c.id) ? "✓" : "—"}
                </td>
                <td>
                  <button type="button" onClick={() => openEdit(c)}>수정</button>
                  <button type="button" onClick={() => toggleHidden(c)}>
                    {c.hidden ? "표시" : "숨김"}
                  </button>
                  <button type="button" className="ad-danger" onClick={() => remove(c)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {!loading && cats.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#aaa", padding: "30px 0" }}>
                  카테고리 없음 — 시드 스크립트를 실행하거나 직접 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
