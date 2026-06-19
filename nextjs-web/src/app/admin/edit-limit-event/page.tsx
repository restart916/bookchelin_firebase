"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDocTo,
  asNumber,
  asString,
  deleteDocAt,
  listDocs,
  updateDocAt,
  type DocRow,
} from "@/lib/admin-db";

const EMPTY_FORM = {
  limitEventId: "",
  book_id: "",
  limit_seconds: "600",
  time_event_user_count: "0",
  is_active: true,
  create_time: "",
};

export default function AdminEditLimitEventPage() {
  const [books, setBooks] = useState<DocRow[]>([]);
  const [events, setEvents] = useState<DocRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const e = await listDocs("limit_event", { field: "is_active", dir: "desc" });
    setEvents(e);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, e] = await Promise.all([
        listDocs("books"),
        listDocs("limit_event", { field: "is_active", dir: "desc" }),
      ]);
      if (!active) return;
      setBooks(b);
      setEvents(e);
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

  function bookName(id: unknown): string {
    return bookMap[asString(id)] ?? "";
  }

  // Parent-cached aggregates only — never iterate read_history (CLAUDE.md).
  function historyUserCount(ev: DocRow): string {
    const current = asNumber(ev.user_count);
    const seeded = asNumber(ev.time_event_user_count);
    return `${seeded} + ${current} = ${seeded + current}`;
  }

  function clearInput() {
    setForm({ ...EMPTY_FORM });
  }

  function selectEvent(ev: DocRow) {
    setForm({
      limitEventId: ev.id,
      book_id: asString(ev.book_id),
      limit_seconds: asString(ev.limit_seconds ?? "600"),
      time_event_user_count: asString(ev.time_event_user_count ?? "0"),
      is_active: ev.is_active !== false,
      create_time: asString(ev.create_time),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEvent() {
    setSaving(true);
    try {
      if (form.limitEventId) {
        await updateDocAt("limit_event", form.limitEventId, {
          book_id: form.book_id,
          limit_seconds: asNumber(form.limit_seconds),
          is_active: form.is_active,
          time_event_user_count: asNumber(form.time_event_user_count),
          create_time: form.create_time,
        });
        alert("수정 성공");
      } else {
        await addDocTo("limit_event", {
          book_id: form.book_id,
          limit_seconds: asNumber(form.limit_seconds),
          is_active: form.is_active,
          time_event_user_count: asNumber(form.time_event_user_count),
          create_time: form.create_time,
          read_history: [],
          has_subcollection_history: true,
          user_count: 0,
          total_read_time: 0,
        });
        alert("추가 성공");
      }
      clearInput();
      await reload();
    } catch (e) {
      console.error(e);
      alert(form.limitEventId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(ev: DocRow, is_active: boolean) {
    try {
      await updateDocAt("limit_event", ev.id, { is_active });
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, is_active } : x)));
      alert("수정 성공");
    } catch (e) {
      console.error(e);
      alert("수정 실패");
    }
  }

  async function deleteEvent(ev: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("limit_event", ev.id);
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>리밋 이벤트 관리</h1>
      <p className="admin-sub">
        총 <b>{events.length}</b>개 {loaded ? "" : "(불러오는 중…)"} — limitEvent_id를 비우고 저장하면 추가, 채워지면 수정. 인원/총 읽기시간은 서버 집계값(user_count/total_read_time)을 그대로 표시합니다.
      </p>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.limitEventId ? "리밋 이벤트 수정" : "새 리밋 이벤트"}</h2>
          {form.limitEventId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.limitEventId && <p className="ad-hint">수정 중: {form.limitEventId}</p>}

        <div className="ad-field">
          <label>book_id</label>
          <input value={form.book_id} onChange={(e) => setForm({ ...form, book_id: e.target.value })} />
          {form.book_id && <p className="ad-hint">{bookName(form.book_id) || "(매칭되는 책 없음)"}</p>}
        </div>
        <div className="ad-row">
          <div className="ad-field">
            <label>전체시간 (초, 10분 → 600)</label>
            <input value={form.limit_seconds} onChange={(e) => setForm({ ...form, limit_seconds: e.target.value })} />
          </div>
          <div className="ad-field">
            <label>뉴추천 탐색 인원 수 (time_event_user_count)</label>
            <input
              value={form.time_event_user_count}
              onChange={(e) => setForm({ ...form, time_event_user_count: e.target.value })}
            />
          </div>
        </div>
        <div className="ad-field">
          <label>등록날짜</label>
          <input value={form.create_time} onChange={(e) => setForm({ ...form, create_time: e.target.value })} />
        </div>
        <div className="ad-field">
          <label>활성화여부</label>
          <label>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> 활성화
          </label>
        </div>
        <div className="ad-form__actions">
          <button type="button" className="ad-primary" disabled={saving} onClick={saveEvent}>
            {saving ? "저장 중…" : form.limitEventId ? "수정 저장" : "추가"}
          </button>
          {form.limitEventId && (
            <button type="button" onClick={clearInput}>
              취소
            </button>
          )}
        </div>
      </section>

      <table className="ad-table">
        <thead>
          <tr>
            <th>book_id</th>
            <th>제목</th>
            <th>총 읽기시간</th>
            <th>인원 (seed + 현재)</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td style={{ fontFamily: "monospace" }}>{asString(ev.book_id)}</td>
              <td>{bookName(ev.book_id)}</td>
              <td>{asNumber(ev.total_read_time)}</td>
              <td>{historyUserCount(ev)}</td>
              <td>
                <span className={ev.is_active !== false ? "ad-badge ad-badge--active" : "ad-badge ad-badge--hidden"}>
                  {ev.is_active !== false ? "활성" : "비활성"}
                </span>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectEvent(ev)}>
                  수정
                </button>{" "}
                {ev.is_active === false ? (
                  <button type="button" onClick={() => setActive(ev, true)}>
                    활성화
                  </button>
                ) : (
                  <button type="button" onClick={() => setActive(ev, false)}>
                    비활성화
                  </button>
                )}{" "}
                <button type="button" className="ad-danger" onClick={() => deleteEvent(ev)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "이벤트가 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
