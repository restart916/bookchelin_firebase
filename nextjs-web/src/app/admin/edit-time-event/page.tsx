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
  timeEventId: "",
  book_id: "",
  event_minute: "360000",
  remain_time: "360000",
  is_active: true,
  create_time: "",
};

export default function AdminEditTimeEventPage() {
  const [books, setBooks] = useState<DocRow[]>([]);
  const [events, setEvents] = useState<DocRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const e = await listDocs("time_event");
    setEvents(e);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, e] = await Promise.all([listDocs("books"), listDocs("time_event")]);
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

  function clearInput() {
    setForm({ ...EMPTY_FORM });
  }

  function selectEvent(ev: DocRow) {
    setForm({
      timeEventId: ev.id,
      book_id: asString(ev.book_id),
      event_minute: asString(ev.event_minute ?? "360000"),
      remain_time: asString(ev.remain_time ?? "360000"),
      is_active: ev.is_active !== false,
      create_time: asString(ev.create_time),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEvent() {
    setSaving(true);
    try {
      if (form.timeEventId) {
        await updateDocAt("time_event", form.timeEventId, {
          book_id: form.book_id,
          event_minute: asNumber(form.event_minute),
          remain_time: asNumber(form.remain_time),
          is_active: form.is_active,
          create_time: form.create_time,
        });
        alert("수정 성공");
      } else {
        // CLAUDE.md invariant: every event doc must carry the subcollection
        // marker + parent-cached aggregates. The legacy Vue create omitted
        // these for time_event; we set them here to stay compliant.
        await addDocTo("time_event", {
          book_id: form.book_id,
          event_minute: asNumber(form.event_minute),
          remain_time: asNumber(form.remain_time),
          is_active: form.is_active,
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
      alert(form.timeEventId ? "수정 실패" : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(ev: DocRow) {
    if (!confirm("정말 삭제하십니까?")) return;
    try {
      await deleteDocAt("time_event", ev.id);
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      alert("삭제 성공");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  return (
    <div className="admin-content">
      <h1>타임 이벤트 관리</h1>
      <p className="admin-sub">
        총 <b>{events.length}</b>개 {loaded ? "" : "(불러오는 중…)"} — timeEvent_id를 비우고 저장하면 추가, 채워지면 수정. 집계값(user_count/total_read_time)은 서버가 관리하므로 건드리지 않습니다.
      </p>

      <section className="ad-form">
        <div className="ad-form__head">
          <h2>{form.timeEventId ? "타임 이벤트 수정" : "새 타임 이벤트"}</h2>
          {form.timeEventId && (
            <button type="button" onClick={clearInput}>
              ✕ 새로 작성
            </button>
          )}
        </div>
        {form.timeEventId && <p className="ad-hint">수정 중: {form.timeEventId}</p>}

        <div className="ad-field">
          <label>book_id</label>
          <input value={form.book_id} onChange={(e) => setForm({ ...form, book_id: e.target.value })} />
          {form.book_id && <p className="ad-hint">{bookName(form.book_id) || "(매칭되는 책 없음)"}</p>}
        </div>
        <div className="ad-row">
          <div className="ad-field">
            <label>전체시간 (초, 100시간 → 360000)</label>
            <input value={form.event_minute} onChange={(e) => setForm({ ...form, event_minute: e.target.value })} />
          </div>
          <div className="ad-field">
            <label>남은시간 (최초 등록 시 전체시간과 동일하게)</label>
            <input value={form.remain_time} onChange={(e) => setForm({ ...form, remain_time: e.target.value })} />
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
            {saving ? "저장 중…" : form.timeEventId ? "수정 저장" : "추가"}
          </button>
          {form.timeEventId && (
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
            <th>전체/남은(초)</th>
            <th>총 읽기시간</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td style={{ fontFamily: "monospace" }}>{asString(ev.book_id)}</td>
              <td>{bookName(ev.book_id)}</td>
              <td>
                {asString(ev.event_minute)} / {asString(ev.remain_time)}
              </td>
              <td>{asNumber(ev.total_read_time)}</td>
              <td>
                <span className={ev.is_active !== false ? "ad-badge ad-badge--active" : "ad-badge ad-badge--hidden"}>
                  {ev.is_active !== false ? "활성" : "비활성"}
                </span>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => selectEvent(ev)}>
                  수정
                </button>{" "}
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
