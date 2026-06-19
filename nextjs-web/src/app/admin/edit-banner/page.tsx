"use client";

import { useEffect, useState } from "react";

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

const EMPTY_FORM = {
  bannerId: "",
  link_url: "",
  firestore_url: "",
  order: "0",
};

export default function AdminEditBannerPage() {
  const [banners, setBanners] = useState<DocRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const b = await listDocs("banners", { field: "order", dir: "asc" });
    setBanners(b);
    setLoaded(true);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const b = await listDocs("banners", { field: "order", dir: "asc" });
      if (!active) return;
      setBanners(b);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  function clearInput() {
    setForm({ ...EMPTY_FORM });
    setImageFile(null);
  }

  function selectBanner(b: DocRow) {
    setForm({
      bannerId: b.id,
      link_url: asString(b.link_url),
      firestore_url: asString(b.firestore_url),
      order: asString(b.order ?? "0"),
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addBanner() {
    setSaving(true);
    try {
      let url: string | null = null;
      if (imageFile) {
        url = await uploadToStorage("banner_image/" + imageFile.name, imageFile);
      }

      if (form.bannerId) {
        const data: Record<string, unknown> = {
          link_url: form.link_url,
          order: asNumber(form.order),
        };
        if (url) data.firestore_url = url;
        await updateDocAt("banners", form.bannerId, data);
        alert("수정 성공");
      } else {
        if (!url) {
          alert("파일을 등록해주세요");
          setSaving(false);
          return;
        }
        await addDocTo("banners", {
          firestore_url: url,
          link_url: form.link_url,
          order: asNumber(form.order),
        });
        alert("추가 성공");
      }
      clearInput();
      await reload();
    } catch (e) {
      console.error(e);
      alert(form.bannerId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBanner(b: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("banners", b.id);
      setBanners((prev) => prev.filter((x) => x.id !== b.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>배너 관리</h1>
      <p className="admin-sub">
        총 <b>{banners.length}</b>개 {loaded ? "" : "(불러오는 중…)"} — banner_id를 비우고 저장하면 추가, 채워지면 수정. 수정 시 이미지는 변경할 때만 첨부.
      </p>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.bannerId ? "배너 수정" : "새 배너 추가"}</h2>
          {form.bannerId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.bannerId && <p className="ad-hint">수정 중: {form.bannerId}</p>}

        <div className="ad-field">
          <label>link_url</label>
          <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>순서 (숫자)</label>
          <input value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>image_file</label>
          <input type="file" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
        </div>
        {form.firestore_url && (
          <div className="ad-field">
            <label>현재 이미지</label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.firestore_url} referrerPolicy="no-referrer" alt="" style={{ height: 80 }} />
          </div>
        )}
        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={addBanner}>
            {saving ? "저장 중…" : form.bannerId ? "수정 저장" : "추가"}
          </button>
          {form.bannerId && (
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
            <th>link_url</th>
            <th>순서</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((b) => (
            <tr key={b.id}>
              <td>
                {b.firestore_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asString(b.firestore_url)} referrerPolicy="no-referrer" alt="" style={{ height: 50 }} />
                ) : null}
              </td>
              <td>{asString(b.link_url)}</td>
              <td>{asString(b.order)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectBanner(b)}>
                  수정
                </button>{" "}
                <button type="button" className="ad-danger" onClick={() => deleteBanner(b)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {banners.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "배너가 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
