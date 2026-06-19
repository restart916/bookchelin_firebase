"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  deleteDocAt,
  getDocById,
  listDocs,
  updateDocAt,
  type DocRow,
} from "@/lib/admin-db";

interface Pin extends DocRow {
  book_id?: string;
  position?: number;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Module-scope wrappers keep impure time calls out of the component body
// (React's purity lint rule flags Date.now()/new Date() inside components).
function nowMillis(): number {
  return Date.now();
}
function nowDate(): Date {
  return new Date();
}

function toMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

const EMPTY_FORM = {
  editingId: "",
  selectedBookId: "",
  position: 1,
  isActive: true,
  startDate: "",
  endDate: "",
};

export default function AdminEditMainBookPage() {
  const [books, setBooks] = useState<DocRow[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [finalCarousel, setFinalCarousel] = useState<string[]>([]);
  const [refreshStatus, setRefreshStatus] = useState("");

  const [bookSearch, setBookSearch] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reloadPins() {
    const p = await listDocs("home_carousel_pins", { field: "position", dir: "asc" });
    setPins(p as Pin[]);
  }

  async function loadFinalCarousel(): Promise<number> {
    const doc = await getDocById("home_dynamic", "current");
    const carousel = doc && Array.isArray(doc.carousel) ? (doc.carousel as string[]) : [];
    setFinalCarousel(carousel);
    return doc ? toMillis(doc.updated_at) : 0;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, p] = await Promise.all([
        listDocs("books", { field: "title", dir: "asc" }),
        listDocs("home_carousel_pins", { field: "position", dir: "asc" }),
      ]);
      const doc = await getDocById("home_dynamic", "current");
      if (!active) return;
      setBooks(b);
      setPins(p as Pin[]);
      setFinalCarousel(doc && Array.isArray(doc.carousel) ? (doc.carousel as string[]) : []);
    })();
    return () => {
      active = false;
    };
  }, []);

  const bookMap = useMemo(() => {
    const m: Record<string, DocRow> = {};
    for (const b of books) m[b.id] = b;
    return m;
  }, [books]);

  function bookFor(bookId: unknown): DocRow | undefined {
    return bookMap[asString(bookId)];
  }

  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    return books.filter((b) => {
      if (b.hidden === true) return false;
      return !q || asString(b.title).toLowerCase().includes(q);
    });
  }, [books, bookSearch]);

  const sortedPins = useMemo(() => {
    return [...pins].sort(
      (a, b) =>
        asNumber(a.position) - asNumber(b.position) || String(a.id).localeCompare(String(b.id)),
    );
  }, [pins]);

  const maxPosition = Math.max(1, pins.length + (form.editingId ? 5 : 6));

  function pinStatus(pin: Pin): { label: string; className: string; effective: boolean } {
    if (pin.is_active !== true) return { label: "비활성", className: "off", effective: false };
    const today = todayStr();
    if (pin.start_date && pin.start_date > today) {
      return { label: "예약", className: "scheduled", effective: false };
    }
    if (pin.end_date && pin.end_date < today) {
      return { label: "종료", className: "ended", effective: false };
    }
    return { label: "노출 중", className: "active", effective: true };
  }

  const effectivePinnedBookIds = useMemo(() => {
    return new Set(pins.filter((p) => pinStatus(p).effective).map((p) => asString(p.book_id)));
  }, [pins]);

  function isPinnedBook(bookId: string): boolean {
    return effectivePinnedBookIds.has(bookId);
  }

  function periodLabel(pin: Pin): string {
    return `${pin.start_date || "즉시"} ~ ${pin.end_date || "계속"}`;
  }

  function clearForm() {
    setForm({ ...EMPTY_FORM, position: pins.length + 1 });
    setBookSearch("");
  }

  function editPin(pin: Pin) {
    setForm({
      editingId: pin.id,
      selectedBookId: asString(pin.book_id),
      position: asNumber(pin.position, 1),
      isActive: pin.is_active === true,
      startDate: pin.start_date || "",
      endDate: pin.end_date || "",
    });
    setBookSearch(asString(bookFor(pin.book_id)?.title));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateForm(): string {
    const book = books.find((b) => b.id === form.selectedBookId);
    if (!book || book.hidden === true) return "노출 가능한 책을 선택해주세요.";
    if (!Number.isInteger(Number(form.position)) || Number(form.position) < 1) {
      return "위치는 1 이상의 정수여야 합니다.";
    }
    if (Number(form.position) > maxPosition) {
      return `현재 위치는 ${maxPosition} 이하여야 합니다.`;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      return "종료일은 시작일보다 빠를 수 없습니다.";
    }
    const collision = pins.find(
      (p) => p.id !== form.editingId && p.is_active === true && asNumber(p.position) === Number(form.position),
    );
    if (form.isActive && collision) return "같은 위치에 활성 핀이 이미 있습니다.";
    const duplicate = pins.find(
      (p) => p.id !== form.editingId && p.is_active === true && asString(p.book_id) === form.selectedBookId,
    );
    if (form.isActive && duplicate) return "같은 책의 활성 핀이 이미 있습니다.";
    return "";
  }

  async function waitForCarouselRefresh(afterMs: number) {
    setRefreshStatus("편성 갱신 중…");
    for (let i = 0; i < 10; i++) {
      const updatedAt = await loadFinalCarousel();
      if (updatedAt >= afterMs) {
        setRefreshStatus("편성 갱신 완료");
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    setRefreshStatus("핀은 저장됨 · 편성 갱신 대기");
  }

  async function savePin() {
    const error = validateForm();
    if (error) {
      alert(error);
      return;
    }
    setSaving(true);
    const before = nowMillis();
    const data: Record<string, unknown> = {
      book_id: form.selectedBookId,
      position: Number(form.position),
      is_active: form.isActive,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      updated_at: nowDate(),
    };
    try {
      if (form.editingId) {
        await updateDocAt("home_carousel_pins", form.editingId, data);
      } else {
        data.created_at = nowDate();
        await addDocTo("home_carousel_pins", data);
      }
      clearForm();
      await reloadPins();
      await waitForCarouselRefresh(before);
    } catch (e) {
      console.error("savePin failed", e);
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deletePin(id: string) {
    if (!confirm("이 핀을 삭제할까요?")) return;
    const before = nowMillis();
    try {
      await deleteDocAt("home_carousel_pins", id);
      if (form.editingId === id) clearForm();
      await reloadPins();
      await waitForCarouselRefresh(before);
    } catch (e) {
      console.error("deletePin failed", e);
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function movePin(pin: Pin, direction: number) {
    const index = sortedPins.findIndex((item) => item.id === pin.id);
    const other = sortedPins[index + direction];
    if (!other) return;
    const before = nowMillis();
    const now = nowDate();
    try {
      await updateDocAt("home_carousel_pins", pin.id, { position: asNumber(other.position), updated_at: now });
      await updateDocAt("home_carousel_pins", other.id, { position: asNumber(pin.position), updated_at: now });
      await reloadPins();
      await waitForCarouselRefresh(before);
    } catch (e) {
      console.error("movePin failed", e);
      alert(`순서 변경 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="admin-content">
      <h1>홈 상단 관리</h1>
      <p className="admin-sub">
        수동 핀은 매일 자동 선정되는 5권에 추가됩니다. 위치는 최종 캐러셀 기준이며 1부터 시작합니다.
      </p>
      {refreshStatus && (
        <p className="ad-hint" style={{ color: refreshStatus.indexOf("대기") >= 0 ? "#b26a00" : "#18864b" }}>
          {refreshStatus}
        </p>
      )}

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.editingId ? "핀 수정" : "새 핀 추가"}</h2>
          {form.editingId && (
            <button type="button" onClick={clearForm}>
              ✕ 새로 작성
            </button>
          )}
        </div>

        <div className="ad-field">
          <label>책 검색</label>
          <input value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} placeholder="책 제목을 입력하세요" />
        </div>
        <div className="ad-field">
          <label>책 선택</label>
          <select value={form.selectedBookId} onChange={(e) => setForm({ ...form, selectedBookId: e.target.value })}>
            <option value="" disabled>
              노출할 책을 선택하세요
            </option>
            {filteredBooks.map((b) => (
              <option key={b.id} value={b.id}>
                {asString(b.title)} ({b.id})
              </option>
            ))}
          </select>
        </div>
        <div className="ad-row">
          <div className="ad-field">
            <label>최종 위치 (1~{maxPosition})</label>
            <input
              type="number"
              min={1}
              max={maxPosition}
              value={form.position}
              onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
            />
          </div>
          <div className="ad-field">
            <label>시작일 (선택)</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="ad-field">
            <label>종료일 (선택·포함)</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="ad-field">
            <label>활성</label>
            <label>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> 활성
            </label>
          </div>
        </div>
        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={savePin}>
            {saving ? "저장 중…" : form.editingId ? "수정 저장" : "핀 추가"}
          </button>
          {form.editingId && (
            <button type="button" disabled={saving} onClick={clearForm}>
              취소
            </button>
          )}
        </div>
      </section>

      <h2 style={{ fontSize: 17 }}>수동 핀</h2>
      <table className="ad-table">
        <thead>
          <tr>
            <th>위치</th>
            <th>책</th>
            <th>노출 기간</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {sortedPins.map((pin, index) => {
            const status = pinStatus(pin);
            const book = bookFor(pin.book_id);
            return (
              <tr key={pin.id}>
                <td style={{ fontWeight: 700 }}>{asString(pin.position)}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {book?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asString(book.image_url)} referrerPolicy="no-referrer" alt="" width={42} height={62} style={{ objectFit: "cover", borderRadius: 3 }} />
                    ) : null}
                    <div>
                      <strong>{asString(book?.title) || "(삭제되거나 숨김 처리된 책)"}</strong>
                      <br />
                      <small style={{ color: "#888" }}>{asString(pin.book_id)}</small>
                    </div>
                  </div>
                </td>
                <td>{periodLabel(pin)}</td>
                <td>
                  <span className={`ad-badge ${status.effective ? "ad-badge--active" : "ad-badge--hidden"}`}>{status.label}</span>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" disabled={index === 0} onClick={() => movePin(pin, -1)}>
                    ↑
                  </button>{" "}
                  <button type="button" disabled={index === sortedPins.length - 1} onClick={() => movePin(pin, 1)}>
                    ↓
                  </button>{" "}
                  <button type="button" onClick={() => editPin(pin)}>
                    수정
                  </button>{" "}
                  <button type="button" className="ad-danger" onClick={() => deletePin(pin.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
          {sortedPins.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#888", padding: 24 }}>
                등록된 핀이 없습니다. 자동 선정 5권만 노출됩니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}>
        <h2 style={{ fontSize: 17 }}>
          현재 최종 캐러셀 <small style={{ color: "#888", fontWeight: 400 }}>(home_dynamic/current.carousel)</small>
        </h2>
        <button type="button" onClick={() => loadFinalCarousel()}>
          새로고침
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {finalCarousel.map((bookId, index) => {
          const book = bookFor(bookId);
          const pinned = isPinnedBook(bookId);
          return (
            <div
              key={bookId}
              style={{ position: "relative", display: "flex", width: 260, border: "1px solid #e1e5e8", borderRadius: 8, padding: 10, gap: 10, background: "#fff" }}
            >
              <span
                style={{ position: "absolute", top: -8, left: -8, width: 24, height: 24, borderRadius: "50%", background: "#222", color: "#fff", textAlign: "center", lineHeight: "24px", fontWeight: 700 }}
              >
                {index + 1}
              </span>
              {book?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asString(book.image_url)} referrerPolicy="no-referrer" alt="" width={62} height={92} style={{ objectFit: "cover", borderRadius: 4 }} />
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                <strong>{asString(book?.title) || bookId}</strong>
                <small style={{ color: "#888" }}>{bookId}</small>
                <span
                  className={`ad-badge ${pinned ? "" : ""}`}
                  style={{ marginTop: 8, alignSelf: "flex-start", background: pinned ? "#e7dbff" : "#dceeff", color: pinned ? "#5b2d90" : "#245b88" }}
                >
                  {pinned ? "수동 핀" : "자동 선정"}
                </span>
              </div>
            </div>
          );
        })}
        {finalCarousel.length === 0 && <div style={{ color: "#888", padding: 24 }}>아직 생성된 캐러셀이 없습니다.</div>}
      </div>
    </div>
  );
}
