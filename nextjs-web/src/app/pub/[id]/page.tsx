"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { asNumber, asString, getDocById, listDocsPaginated } from "@/lib/admin-db";

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

function mergeDayDataFiltered(
  main: RowMap,
  datas: Record<string, unknown> | undefined,
  allowedBookIds: Set<string>,
) {
  if (!datas) return;
  for (const [key, raw] of Object.entries(datas)) {
    const data = raw as Record<string, unknown>;
    const bookId = asString(data.book_id);
    if (!allowedBookIds.has(bookId)) continue;
    const existing = Object.values(main).find((v) => v.book_id === bookId);
    if (existing) {
      if (!existing.event_id.includes(key)) existing.event_id.push(key);
      existing.total_read_time = num(data.total_read_time);
      existing.avg_user_read_time = num(data.avg_user_read_time);
      existing.average_review = num(data.average_review);
      existing.review_count = num(data.review_count);
      existing.create_time = existing.create_time || asString(data.create_time);
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

export default function PublisherDetailPage() {
  const params = useParams();
  const publisherId = asString(params?.id);

  const today = new Date();
  const defaultStart = new Date(today.getTime() - 7 * 86400000);
  const defaultEnd = new Date(today.getTime() + 86400000);

  const [publisherName, setPublisherName] = useState("");
  const [publisherCode, setPublisherCode] = useState("");
  const [bookIds, setBookIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState(fmtDate(defaultStart));
  const [endDate, setEndDate] = useState(fmtDate(defaultEnd));
  const [timeDatas, setTimeDatas] = useState<EventRow[]>([]);
  const [limitDatas, setLimitDatas] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!publisherId) return;
    let active = true;
    (async () => {
      try {
        const pubDoc = await getDocById("publisher", publisherId);
        if (!pubDoc) {
          if (active) setNotFound(true);
          return;
        }
        const code = asString(pubDoc.code);
        const name = asString(pubDoc.name || pubDoc.publisher_name || code);
        if (!active) return;
        setPublisherName(name);
        setPublisherCode(code);

        const booksResult = await listDocsPaginated("books", {
          pageSize: 200,
          whereClauses: [["publisher", "==", code]],
        });
        const ids = new Set(booksResult.docs.map((d) => d.id));
        if (!active) return;
        setBookIds(ids);
        setInitLoading(false);
        await loadEventDataInner(fmtDate(defaultStart), fmtDate(defaultEnd), ids);
      } catch (e) {
        console.error("출판사 초기 로딩 실패", e);
        if (active) setInitLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publisherId]);

  async function loadEventDataInner(start: string, end: string, ids: Set<string>) {
    if (ids.size === 0) return;
    setLoading(true);
    try {
      const timeMap: RowMap = {};
      const limitMap: RowMap = {};

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
        mergeDayDataFiltered(timeMap, doc.time_datas as Record<string, unknown> | undefined, ids);
        mergeDayDataFiltered(limitMap, doc.limit_datas as Record<string, unknown> | undefined, ids);
      }

      const [limitEvRes, timeEvRes] = await Promise.all([
        listDocsPaginated("limit_event", { pageSize: 200 }),
        listDocsPaginated("time_event", { pageSize: 200 }),
      ]);
      for (const ev of limitEvRes.docs) {
        if (!ids.has(asString(ev.book_id))) continue;
        const userCount = num(ev.user_count) + num(ev.time_event_user_count);
        const row = Object.values(limitMap).find((v) => v.book_id === asString(ev.book_id));
        if (row) {
          row.show_reader_user_count = Math.max(userCount, row.show_reader_user_count);
          row.show_reader_count += num(ev.user_count);
        }
      }
      for (const ev of timeEvRes.docs) {
        if (!ids.has(asString(ev.book_id))) continue;
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
      console.error("이벤트 데이터 로딩 실패", e);
      alert("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return <p style={{ color: "#c0392b", marginTop: 40 }}>출판사를 찾을 수 없습니다.</p>;
  }
  if (initLoading) {
    return <p style={{ marginTop: 40, color: "#888" }}>출판사 정보 로딩 중…</p>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>출판사 이벤트 통계</h1>
      <p style={{ color: "#6b7280", margin: "0 0 24px" }}>
        {publisherName || publisherCode} (코드: {publisherCode}) · 소속 도서 {bookIds.size}권
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          시작기간
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          종료기간
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => loadEventDataInner(startDate, endDate, bookIds)}
          style={{
            padding: "6px 16px",
            background: "#d23669",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 700,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "조회 중…" : "조회하기"}
        </button>
      </div>

      <PublisherEventTable title="NEW 추천 도서" rows={timeDatas} />
      <div style={{ height: 40 }} />
      <PublisherEventTable title="프리뷰 도서" rows={limitDatas} />
    </div>
  );
}

function PublisherEventTable({ title, rows }: { title: string; rows: EventRow[] }) {
  return (
    <>
      <h2 style={{ fontSize: 17, marginTop: 24 }}>{title}</h2>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            background: "#fff",
          }}
        >
          <thead>
            <tr>
              {[
                "등록날짜","도서명","노출 인원(노출)","상세 인원(클릭)",
                "바로보기 인원(클릭)","총 구독 시간","1인 평균 구독",
                "공유 클릭","구매 클릭","리뷰평점/수",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px 6px",
                    background: "#f7f7f8",
                    color: "#555",
                    fontWeight: 600,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.book_id}>
                <td style={TD}>{d.create_time}</td>
                <td style={TD}>{d.book_name}</td>
                <td style={TD}>{d.show_new_main_user_count} ({d.show_new_main_books})</td>
                <td style={TD}>{d.show_detail_user_count} ({d.show_detail_count})</td>
                <td style={TD}>{d.show_reader_user_count} ({d.show_reader_count})</td>
                <td style={TD}>{getTimeString(d.total_read_time)}</td>
                <td style={TD}>{getTimeString(d.avg_user_read_time)}</td>
                <td style={TD}>{d.click_share_book_count}</td>
                <td style={TD}>{d.click_buy_book_count}</td>
                <td style={TD}>{d.average_review} / {d.review_count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{ textAlign: "center", color: "#aaa", padding: 24, borderBottom: "1px solid #eee" }}
                >
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

const TD: React.CSSProperties = { borderBottom: "1px solid #eee", padding: "8px 6px", verticalAlign: "middle" };
