"use client";

import { useEffect, useMemo, useState } from "react";

import { asNumber, asString, listDocs } from "@/lib/admin-db";

interface Row {
  bookId: string;
  bookTitle: string;
  count: number;
  perDate: Record<string, number>;
}

export default function AdminCountPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [books, totals] = await Promise.all([
        listDocs("books", { field: "description", dir: "desc" }),
        listDocs("dayly_total"),
      ]);
      if (!active) return;

      const byBook: Record<string, Row> = {};
      for (const b of books) {
        byBook[b.id] = { bookId: b.id, bookTitle: asString(b.title), count: 0, perDate: {} };
      }
      const dateSet = new Set<string>();
      for (const total of totals) {
        const date = total.id;
        dateSet.add(date);
        const counts = (total.total_count ?? {}) as Record<string, unknown>;
        for (const [bid, raw] of Object.entries(counts)) {
          const c = asNumber(raw);
          const row = byBook[bid];
          if (row) {
            row.perDate[date] = c;
            row.count += c;
          }
        }
      }
      setDates([...dateSet].sort());
      setRows(Object.values(byBook));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const visibleRows = useMemo(() => rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count), [rows]);

  return (
    <div className="admin-content">
      <h1>일별 집계 (dayly_total)</h1>
      <p className="admin-sub">
        {loaded ? (
          <>
            읽힌 책 <b>{visibleRows.length}</b>권 · {dates.length}일치
          </>
        ) : (
          "불러오는 중…"
        )}
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="ad-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>제목</th>
              <th>bookId</th>
              <th>합계</th>
              {dates.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.bookId}>
                <td>{r.bookTitle}</td>
                <td style={{ color: "#999", fontFamily: "monospace" }}>{r.bookId}</td>
                <td style={{ fontWeight: 700, textAlign: "right" }}>{r.count.toLocaleString()}</td>
                {dates.map((d) => (
                  <td key={d} style={{ textAlign: "right" }}>
                    {r.perDate[d] ? r.perDate[d].toLocaleString() : ""}
                  </td>
                ))}
              </tr>
            ))}
            {loaded && visibleRows.length === 0 && (
              <tr>
                <td colSpan={3 + dates.length} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                  데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
