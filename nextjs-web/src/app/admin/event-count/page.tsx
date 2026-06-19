"use client";

import { useEffect, useState } from "react";

import { asNumber, asString, getDocById, listDocs } from "@/lib/admin-db";

interface EventRow {
  event_id: string[];
  book_id: string;
  book_name: string;
  create_time: string;
  average_review: number;
  avg_user_read_time: number;
  review_count: number;
  total_read_time: number;
  click_buy_book_count: number;
  click_share_book_count: number;
  show_detail_count: number;
  show_detail_user_count: number;
  show_new_main_books: number;
  show_new_main_user_count: number;
  show_reader_count: number;
  show_reader_user_count: number;
}

type RowMap = Record<string, EventRow>;

function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getTimeString(diffSeconds: unknown): string {
  let s = Math.floor(asNumber(diffSeconds));
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  s -= minutes * 60;
  return `${hours}시간 ${minutes}분 ${s}초`;
}

function num(v: unknown): number {
  return asNumber(v);
}

function mergeDayData(main: RowMap, datas: Record<string, unknown> | undefined) {
  if (!datas) return;
  for (const [key, raw] of Object.entries(datas)) {
    const data = raw as Record<string, unknown>;
    const bookId = asString(data.book_id);
    const existing = Object.values(main).find((v) => v.book_id === bookId);
    if (existing) {
      if (!existing.event_id.includes(key)) existing.event_id.push(key);
      // show most recent snapshot for these
      existing.total_read_time = num(data.total_read_time);
      existing.avg_user_read_time = num(data.avg_user_read_time);
      existing.average_review = num(data.average_review);
      existing.review_count = num(data.review_count);
      existing.create_time = existing.create_time || asString(data.create_time);
      // accumulate counters
      existing.click_buy_book_count += num(data.click_buy_book_count);
      existing.click_share_book_count += num(data.click_share_book_count);
      existing.show_detail_count += num(data.show_detail_count);
      existing.show_detail_user_count += num(data.show_detail_user_count);
      existing.show_new_main_books += num(data.show_new_main_books);
      existing.show_new_main_user_count += num(data.show_new_main_user_count);
    } else {
      main[bookId] = {
        event_id: [key],
        book_id: bookId,
        book_name: asString(data.book_name),
        create_time: asString(data.create_time),
        average_review: num(data.average_review),
        avg_user_read_time: num(data.avg_user_read_time),
        review_count: num(data.review_count),
        total_read_time: num(data.total_read_time),
        click_buy_book_count: num(data.click_buy_book_count),
        click_share_book_count: num(data.click_share_book_count),
        show_detail_count: num(data.show_detail_count),
        show_detail_user_count: num(data.show_detail_user_count),
        show_new_main_books: num(data.show_new_main_books),
        show_new_main_user_count: num(data.show_new_main_user_count),
        show_reader_count: 0,
        show_reader_user_count: 0,
      };
    }
  }
}

export default function AdminEventCountPage() {
  const today = new Date();
  const defaultStart = new Date(today.getTime() - 7 * 86400000);
  const defaultEnd = new Date(today.getTime() + 1 * 86400000);

  const [startDate, setStartDate] = useState(fmtDate(defaultStart));
  const [endDate, setEndDate] = useState(fmtDate(defaultEnd));
  const [timeDatas, setTimeDatas] = useState<EventRow[]>([]);
  const [limitDatas, setLimitDatas] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadEventData(start: string, end: string) {
    setLoading(true);
    try {
      const timeMap: RowMap = {};
      const limitMap: RowMap = {};

      // iterate each day in [start, end)
      const dayIds: string[] = [];
      let cur = new Date(start + "T00:00:00");
      const endD = new Date(end + "T00:00:00");
      while (cur < endD) {
        dayIds.push(fmtDate(cur));
        cur = new Date(cur.getTime() + 86400000);
      }
      const dayDocs = await Promise.all(dayIds.map((id) => getDocById("dayly_event_count", id)));
      for (const doc of dayDocs) {
        if (!doc) continue;
        mergeDayData(timeMap, doc.time_datas as Record<string, unknown> | undefined);
        mergeDayData(limitMap, doc.limit_datas as Record<string, unknown> | undefined);
      }

      // augment reader counts from parent-cached event aggregates (never read_history)
      const [limitEvents, timeEvents] = await Promise.all([listDocs("limit_event"), listDocs("time_event")]);
      for (const ev of limitEvents) {
        const parentUserCount = num(ev.user_count);
        const seeded = num(ev.time_event_user_count);
        const userCount = parentUserCount + seeded;
        const readCount = parentUserCount;
        const row = Object.values(limitMap).find((v) => v.book_id === asString(ev.book_id));
        if (row) {
          row.show_reader_user_count = Math.max(userCount, row.show_reader_user_count);
          row.show_reader_count += readCount;
        }
      }
      for (const ev of timeEvents) {
        const userCount = num(ev.user_count);
        const row = Object.values(timeMap).find((v) => v.book_id === asString(ev.book_id));
        if (row) {
          row.show_reader_user_count = Math.max(userCount, row.show_reader_user_count);
          row.show_reader_count += userCount;
        }
      }

      setTimeDatas(Object.values(timeMap));
      setLimitDatas(Object.values(limitMap));
    } catch (e) {
      console.error("event-count 로딩 실패", e);
      alert("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await loadEventData(fmtDate(defaultStart), fmtDate(defaultEnd));
    })();
    return () => {
      active = false;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-content">
      <h1>이벤트 카운트</h1>
      <p className="admin-sub">dayly_event_count 일별 집계 + 이벤트 부모 문서의 누적 인원/시간을 합산해 표시합니다.</p>

      <div className="ad-filters">
        <label>
          시작기간{" "}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          종료기간{" "}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="button" className="ad-primary" disabled={loading} onClick={() => loadEventData(startDate, endDate)}>
          {loading ? "조회 중…" : "조회하기"}
        </button>
      </div>

      <EventTable title="NEW 추천 도서" rows={timeDatas} />
      <div style={{ height: 40 }} />
      <EventTable title="프리뷰 도서" rows={limitDatas} />
    </div>
  );
}

function EventTable({ title, rows }: { title: string; rows: EventRow[] }) {
  return (
    <>
      <h2 style={{ fontSize: 17, marginTop: 24 }}>{title}</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="ad-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>이벤트 ID</th>
              <th>도서 ID</th>
              <th>등록날짜</th>
              <th>도서명</th>
              <th>노출 인원(노출)</th>
              <th>상세 인원(클릭)</th>
              <th>바로보기 인원(클릭)</th>
              <th>총 구독 시간</th>
              <th>1인 평균 구독</th>
              <th>공유 클릭</th>
              <th>구매 클릭</th>
              <th>리뷰평점/수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.book_id}>
                <td style={{ fontFamily: "monospace" }}>{d.event_id.join(", ")}</td>
                <td style={{ fontFamily: "monospace" }}>{d.book_id}</td>
                <td>{d.create_time}</td>
                <td>{d.book_name}</td>
                <td>
                  {d.show_new_main_user_count} ({d.show_new_main_books})
                </td>
                <td>
                  {d.show_detail_user_count} ({d.show_detail_count})
                </td>
                <td>
                  {d.show_reader_user_count} ({d.show_reader_count})
                </td>
                <td>{getTimeString(d.total_read_time)}</td>
                <td>{getTimeString(d.avg_user_read_time)}</td>
                <td>{d.click_share_book_count}</td>
                <td>{d.click_buy_book_count}</td>
                <td>
                  {d.average_review} / {d.review_count}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", color: "#aaa", padding: 24 }}>
                  데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
