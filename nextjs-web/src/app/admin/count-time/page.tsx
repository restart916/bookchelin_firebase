"use client";

import { useEffect, useMemo, useState } from "react";

import { asNumber, asString, getDocById, listDocsByIdRange } from "@/lib/admin-db";

interface TimeRow {
  bookId: string;
  count: number;
  buckets: Record<string, number>;
}

type UnitKey = "month" | "week" | "day";

const UNITS: { key: UnitKey; label: string; ranges: { label: string; days: number | null }[] }[] = [
  { key: "month", label: "월", ranges: [{ label: "6개월", days: 182 }, { label: "12개월", days: 365 }, { label: "전체", days: null }] },
  { key: "week", label: "주", ranges: [{ label: "8주", days: 56 }, { label: "26주", days: 182 }, { label: "52주", days: 364 }] },
  { key: "day", label: "일", ranges: [{ label: "14일", days: 14 }, { label: "30일", days: 30 }, { label: "90일", days: 90 }] },
];

function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function subtractDays(days: number): string {
  return fmtDate(new Date(Date.now() - days * 86400000));
}

// 'YYYY-Www' ISO week label for a 'YYYY-MM-DD' doc id.
function isoWeekBucket(id: string): string {
  const d = new Date(id + "T00:00:00");
  const target = new Date(d.getTime());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3); // Thursday of this week
  const weekYear = target.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export default function AdminCountTimePage() {
  const [activeUnit, setActiveUnit] = useState<UnitKey>("month");
  const [activeDays, setActiveDays] = useState<number | null>(182);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");

  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [hiddenSet, setHiddenSet] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [docCount, setDocCount] = useState(0);

  function bucketOf(id: string, unit: UnitKey): string {
    if (unit === "day") return id;
    if (unit === "week") return isoWeekBucket(id);
    return id.slice(0, 7);
  }

  async function runQuery(startId: string | null, endId: string | null, unit: UnitKey) {
    setLoading(true);
    setRows([]);
    setBuckets([]);
    setDocCount(0);
    try {
      // title map from the lean search_index/books doc (not the 700+ books collection)
      let titles = titleMap;
      if (Object.keys(titles).length === 0) {
        const siDoc = await getDocById("search_index", "books");
        const list = (siDoc && Array.isArray(siDoc.books) ? siDoc.books : []) as { id?: string; title?: string }[];
        const map: Record<string, string> = {};
        for (const b of list) if (b.id) map[b.id] = asString(b.title);
        titles = map;
        setTitleMap(map);
      }

      const docs = await listDocsByIdRange("dayly_total_time", startId, endId);
      setDocCount(docs.length);

      const byBook: Record<string, TimeRow> = {};
      const bucketSet = new Set<string>();
      for (const doc of docs) {
        const bucket = bucketOf(doc.id, unit);
        bucketSet.add(bucket);
        const counts = (doc.total_count ?? {}) as Record<string, unknown>;
        for (const [bid, raw] of Object.entries(counts)) {
          const t = asNumber(raw);
          if (!t) continue;
          let row = byBook[bid];
          if (!row) row = byBook[bid] = { bookId: bid, count: 0, buckets: {} };
          row.buckets[bucket] = (row.buckets[bucket] ?? 0) + t;
          row.count += t;
        }
      }

      const sortedBuckets = [...bucketSet].sort().reverse();
      const sortedRows = Object.values(byBook).sort((a, b) => b.count - a.count);
      setBuckets(sortedBuckets);
      setRows(sortedRows);

      // backfill titles for books missing from search_index (hidden/old), top 100 only
      const missing = sortedRows.map((r) => r.bookId).filter((id) => !titles[id]).slice(0, 100);
      if (missing.length) {
        const snaps = await Promise.all(missing.map((id) => getDocById("books", id)));
        const mergedTitles = { ...titles };
        const mergedHidden = { ...hiddenSet };
        for (const s of snaps) {
          if (!s) continue;
          if (s.title) mergedTitles[s.id] = asString(s.title);
          if (s.hidden === true) mergedHidden[s.id] = true;
        }
        setTitleMap(mergedTitles);
        setHiddenSet(mergedHidden);
      }
    } catch (e) {
      console.error("count-time 로딩 실패", e);
      alert("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  function load(days: number | null, unit: UnitKey) {
    setMode("preset");
    setActiveDays(days);
    const startId = days ? subtractDays(days) : null;
    return runQuery(startId, null, unit);
  }

  function selectUnit(key: UnitKey) {
    if (key === activeUnit) return;
    setActiveUnit(key);
    if (mode === "custom") {
      runQuery(customStart, customEnd, key);
    } else {
      const firstDays = UNITS.find((u) => u.key === key)!.ranges[0].days;
      load(firstDays, key);
    }
  }

  function loadCustom() {
    if (!customStart || !customEnd) return;
    let start = customStart;
    let end = customEnd;
    if (start > end) [start, end] = [end, start];
    setMode("custom");
    setActiveDays(null);
    return runQuery(start, end, activeUnit);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await runQuery(subtractDays(182), null, "month");
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRanges = UNITS.find((u) => u.key === activeUnit)!.ranges;

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (titleMap[r.bookId] ?? "").toLowerCase().includes(q) || r.bookId.toLowerCase().includes(q));
  }, [rows, filterText, titleMap]);

  const rangeLabel = buckets.length === 0 ? "데이터 없음" : `${buckets[buckets.length - 1]} ~ ${buckets[0]}`;

  return (
    <div className="admin-content">
      <h1>독서시간 집계 (dayly_total_time)</h1>
      <p className="admin-sub">단위(일/주/월)와 기간을 선택해 책별 누적 독서시간을 집계합니다.</p>

      <div className="ad-filters">
        <span>단위</span>
        {UNITS.map((u) => (
          <button
            key={u.key}
            type="button"
            className={activeUnit === u.key ? "ad-primary" : ""}
            disabled={loading}
            onClick={() => selectUnit(u.key)}
          >
            {u.label}
          </button>
        ))}
        <span style={{ marginLeft: 12 }}>기간</span>
        {currentRanges.map((r) => (
          <button
            key={r.label}
            type="button"
            className={mode === "preset" && activeDays === r.days ? "ad-primary" : ""}
            disabled={loading}
            onClick={() => load(r.days, activeUnit)}
          >
            {r.label}
          </button>
        ))}
        <span style={{ marginLeft: 12 }}>직접</span>
        <input type="date" value={customStart} disabled={loading} onChange={(e) => setCustomStart(e.target.value)} />
        <span>~</span>
        <input type="date" value={customEnd} disabled={loading} onChange={(e) => setCustomEnd(e.target.value)} />
        <button type="button" className={mode === "custom" ? "ad-primary" : ""} disabled={loading || !customStart || !customEnd} onClick={loadCustom}>
          조회
        </button>
      </div>

      <div className="ad-filters">
        <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="책 제목·ID 검색" />
        <span>
          {loading ? "불러오는 중…" : `${rangeLabel} · 책 ${filteredRows.length}권 · 읽힌 ${docCount}일`}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="ad-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>책 제목</th>
              <th>bookId</th>
              <th style={{ textAlign: "right" }}>합계</th>
              {buckets.map((b) => (
                <th key={b} style={{ textAlign: "right" }}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.bookId}>
                <td>
                  {titleMap[r.bookId] || "(삭제됨)"}
                  {hiddenSet[r.bookId] && <span className="ad-badge ad-badge--hidden" style={{ marginLeft: 6 }}>비공개</span>}
                </td>
                <td style={{ color: "#999", fontFamily: "monospace" }}>{r.bookId}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{r.count.toLocaleString()}</td>
                {buckets.map((b) => (
                  <td key={b} style={{ textAlign: "right" }}>
                    {r.buckets[b] ? r.buckets[b].toLocaleString() : ""}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={3 + buckets.length} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
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
