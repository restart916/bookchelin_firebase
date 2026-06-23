"use client";

import { useEffect, useMemo, useState } from "react";

import {
  asNumber,
  asString,
  getDocById,
  getDocsByIds,
  listDocs,
  listDocsByIdRange,
} from "@/lib/admin-db";

interface TimeRow {
  bookId: string;
  count: number;
  buckets: Record<string, number>;
}

interface PubRow {
  pubCode: string;   // "" = 출판사 없음
  count: number;
  buckets: Record<string, number>;
}

type UnitKey = "month" | "week" | "day";
type ViewMode = "book" | "publisher";

const UNITS: { key: UnitKey; label: string; ranges: { label: string; days: number | null }[] }[] = [
  { key: "month", label: "월", ranges: [{ label: "6개월", days: 182 }, { label: "12개월", days: 365 }, { label: "전체", days: null }] },
  { key: "week", label: "주", ranges: [{ label: "8주", days: 56 }, { label: "26주", days: 182 }, { label: "52주", days: 364 }] },
  { key: "day", label: "일", ranges: [{ label: "14일", days: 14 }, { label: "30일", days: 30 }, { label: "90일", days: 90 }] },
];

function fmtHours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function subtractDays(days: number): string {
  return fmtDate(new Date(Date.now() - days * 86400000));
}

function isoWeekBucket(id: string): string {
  const d = new Date(id + "T00:00:00");
  const target = new Date(d.getTime());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const weekYear = target.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function bucketOf(id: string, unit: UnitKey): string {
  if (unit === "day") return id;
  if (unit === "week") return isoWeekBucket(id);
  return id.slice(0, 7);
}

export default function AdminCountTimePage() {
  const [activeUnit, setActiveUnit] = useState<UnitKey>("day");
  const [activeDays, setActiveDays] = useState<number | null>(14);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("book");

  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [hiddenSet, setHiddenSet] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [docCount, setDocCount] = useState(0);

  const [byUserMap, setByUserMap] = useState<Record<string, number>>({});
  const [readerCountMap, setReaderCountMap] = useState<Record<string, Record<string, number>>>({});

  // 출판사별 뷰용 매핑
  const [bookPubMap, setBookPubMap] = useState<Record<string, string>>({});   // bookId → publisher code
  const [pubNameMap, setPubNameMap] = useState<Record<string, string>>({});   // code → name
  const [pubMapsLoaded, setPubMapsLoaded] = useState(false);
  const [pubLoading, setPubLoading] = useState(false);

  const byUserBucketMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [date, count] of Object.entries(byUserMap)) {
      const b = bucketOf(date, activeUnit);
      m[b] = (m[b] ?? 0) + count;
    }
    return m;
  }, [byUserMap, activeUnit]);

  const bucketReaderMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const [date, byBook] of Object.entries(readerCountMap)) {
      const b = bucketOf(date, activeUnit);
      if (!m[b]) m[b] = {};
      for (const [bookId, cnt] of Object.entries(byBook)) {
        m[b][bookId] = (m[b][bookId] ?? 0) + cnt;
      }
    }
    return m;
  }, [readerCountMap, activeUnit]);

  const cumulativeReaders = useMemo(() => {
    const m: Record<string, number> = {};
    for (const byBook of Object.values(bucketReaderMap)) {
      for (const [bookId, cnt] of Object.entries(byBook)) {
        m[bookId] = (m[bookId] ?? 0) + cnt;
      }
    }
    return m;
  }, [bucketReaderMap]);

  const totalTimeBucketMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of rows) {
      for (const [b, t] of Object.entries(row.buckets)) {
        m[b] = (m[b] ?? 0) + t;
      }
    }
    return m;
  }, [rows]);

  const grandTotalSeconds = useMemo(
    () => rows.reduce((s, r) => s + r.count, 0),
    [rows],
  );

  // 출판사별 집계 rows
  const pubRows = useMemo<PubRow[]>(() => {
    if (!pubMapsLoaded || rows.length === 0) return [];
    const byPub: Record<string, PubRow> = {};
    for (const row of rows) {
      const code = bookPubMap[row.bookId] ?? "";
      let pr = byPub[code];
      if (!pr) pr = byPub[code] = { pubCode: code, count: 0, buckets: {} };
      pr.count += row.count;
      for (const [b, t] of Object.entries(row.buckets)) {
        pr.buckets[b] = (pr.buckets[b] ?? 0) + t;
      }
    }
    return Object.values(byPub).sort((a, b) => b.count - a.count);
  }, [rows, bookPubMap, pubMapsLoaded]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (titleMap[r.bookId] ?? "").toLowerCase().includes(q) || r.bookId.toLowerCase().includes(q));
  }, [rows, filterText, titleMap]);

  const filteredPubRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return pubRows;
    return pubRows.filter((r) => {
      const name = r.pubCode ? (pubNameMap[r.pubCode] ?? r.pubCode) : "출판사 없음";
      return name.toLowerCase().includes(q);
    });
  }, [pubRows, filterText, pubNameMap]);

  async function loadPublisherMaps(currentRows: TimeRow[]) {
    if (currentRows.length === 0) return;
    setPubLoading(true);
    try {
      const bookIds = [...new Set(currentRows.map((r) => r.bookId))];
      const [bookDocs, pubDocs] = await Promise.all([
        getDocsByIds("books", bookIds),
        listDocs("publisher"),
      ]);
      const bpm: Record<string, string> = {};
      for (const d of bookDocs) bpm[d.id] = asString(d.publisher);
      setBookPubMap(bpm);
      const pnm: Record<string, string> = {};
      for (const d of pubDocs) pnm[asString(d.code)] = asString(d.name || d.publisher_name);
      setPubNameMap(pnm);
      setPubMapsLoaded(true);
    } catch (e) {
      console.error("출판사 매핑 로딩 실패", e);
    } finally {
      setPubLoading(false);
    }
  }

  async function runQuery(startId: string | null, endId: string | null, unit: UnitKey) {
    setLoading(true);
    setRows([]);
    setBuckets([]);
    setDocCount(0);
    setByUserMap({});
    setReaderCountMap({});
    setPubMapsLoaded(false); // 출판사 매핑 무효화
    try {
      let titles = titleMap;
      if (Object.keys(titles).length === 0) {
        const siDoc = await getDocById("search_index", "books");
        const list = (siDoc && Array.isArray(siDoc.books) ? siDoc.books : []) as { id?: string; title?: string }[];
        const map: Record<string, string> = {};
        for (const b of list) if (b.id) map[b.id] = asString(b.title);
        titles = map;
        setTitleMap(map);
      }

      const [timeDocs, byUserDocs, readerDocs] = await Promise.all([
        listDocsByIdRange("dayly_total_time", startId, endId),
        listDocsByIdRange("dayly_total_time_by_user", startId, endId),
        listDocsByIdRange("dayly_reader_count", startId, endId),
      ]);
      setDocCount(timeDocs.length);

      const newByUserMap: Record<string, number> = {};
      for (const doc of byUserDocs) {
        const dataField = doc.data as Record<string, unknown> | undefined;
        newByUserMap[doc.id] =
          dataField && typeof dataField === "object" ? Object.keys(dataField).length : 0;
      }
      setByUserMap(newByUserMap);

      const newReaderCountMap: Record<string, Record<string, number>> = {};
      for (const doc of readerDocs) {
        const rc = (doc.reader_count ?? {}) as Record<string, unknown>;
        const byBook: Record<string, number> = {};
        for (const [bookId, cnt] of Object.entries(rc)) {
          const n = asNumber(cnt);
          if (n) byBook[bookId] = n;
        }
        newReaderCountMap[doc.id] = byBook;
      }
      setReaderCountMap(newReaderCountMap);

      const byBook: Record<string, TimeRow> = {};
      const bucketSet = new Set<string>();
      for (const doc of timeDocs) {
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

  function handleViewModeToggle(next: ViewMode) {
    setViewMode(next);
    if (next === "publisher" && !pubMapsLoaded && rows.length > 0) {
      loadPublisherMaps(rows);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await runQuery(subtractDays(14), null, "day");
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRanges = UNITS.find((u) => u.key === activeUnit)!.ranges;
  const rangeLabel = buckets.length === 0 ? "데이터 없음" : `${buckets[buckets.length - 1]} ~ ${buckets[0]}`;

  return (
    <div className="admin-content">
      <h1>독서시간 집계 (dayly_total_time)</h1>
      <p className="admin-sub">단위(일/주/월)와 기간을 선택해 책별·출판사별 누적 독서시간을 집계합니다.</p>

      {/* 집계 기준 토글 */}
      <div className="ad-filters" style={{ marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>집계 기준</span>
        {(["book", "publisher"] as ViewMode[]).map((vm) => (
          <button
            key={vm}
            type="button"
            className={viewMode === vm ? "ad-primary" : ""}
            onClick={() => handleViewModeToggle(vm)}
          >
            {vm === "book" ? "책별" : "출판사별"}
          </button>
        ))}
        {viewMode === "publisher" && pubLoading && (
          <span style={{ fontSize: 12, color: "#888" }}>출판사 매핑 로딩 중…</span>
        )}
      </div>

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
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={viewMode === "book" ? "책 제목·ID 검색" : "출판사명 검색"}
        />
        <span>
          {loading ? "불러오는 중…" : viewMode === "book"
            ? `${rangeLabel} · 책 ${filteredRows.length}권 · 읽힌 ${docCount}일`
            : `${rangeLabel} · 출판사 ${filteredPubRows.length}개 · 읽힌 ${docCount}일`}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        {viewMode === "book" ? (
          <BookTable
            filteredRows={filteredRows}
            buckets={buckets}
            titleMap={titleMap}
            hiddenSet={hiddenSet}
            cumulativeReaders={cumulativeReaders}
            bucketReaderMap={bucketReaderMap}
            byUserBucketMap={byUserBucketMap}
            totalTimeBucketMap={totalTimeBucketMap}
            grandTotalSeconds={grandTotalSeconds}
            activeUnit={activeUnit}
            loading={loading}
          />
        ) : (
          <PublisherTable
            filteredPubRows={filteredPubRows}
            buckets={buckets}
            pubNameMap={pubNameMap}
            byUserBucketMap={byUserBucketMap}
            totalTimeBucketMap={totalTimeBucketMap}
            grandTotalSeconds={grandTotalSeconds}
            activeUnit={activeUnit}
            loading={loading || pubLoading}
            pubMapsLoaded={pubMapsLoaded}
          />
        )}
      </div>
    </div>
  );
}

// ── 책별 테이블 ──────────────────────────────────────────
function BookTable({
  filteredRows, buckets, titleMap, hiddenSet, cumulativeReaders,
  bucketReaderMap, byUserBucketMap, totalTimeBucketMap,
  grandTotalSeconds, activeUnit, loading,
}: {
  filteredRows: TimeRow[];
  buckets: string[];
  titleMap: Record<string, string>;
  hiddenSet: Record<string, boolean>;
  cumulativeReaders: Record<string, number>;
  bucketReaderMap: Record<string, Record<string, number>>;
  byUserBucketMap: Record<string, number>;
  totalTimeBucketMap: Record<string, number>;
  grandTotalSeconds: number;
  activeUnit: UnitKey;
  loading: boolean;
}) {
  return (
    <table className="ad-table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>책 제목</th>
          <th>bookId</th>
          <th style={{ textAlign: "right" }}>
            <div>합계</div>
            <div style={{ fontWeight: 400, fontSize: 10, color: "#888", marginTop: 1 }}>(독자 연인원)</div>
            {grandTotalSeconds > 0 && (
              <div style={{ fontWeight: 700, fontSize: 11, color: "#c05", marginTop: 2 }}>{fmtHours(grandTotalSeconds)}</div>
            )}
          </th>
          {buckets.map((b) => (
            <th key={b} style={{ textAlign: "right" }}>
              <div>{b}</div>
              {(byUserBucketMap[b] ?? 0) > 0 && (
                <div style={{ fontWeight: 400, fontSize: 10, color: "#888", marginTop: 1 }}>
                  {activeUnit === "day" ? `${byUserBucketMap[b]}명` : `연${byUserBucketMap[b]}명`}
                </div>
              )}
              {(totalTimeBucketMap[b] ?? 0) > 0 && (
                <div style={{ fontWeight: 700, fontSize: 11, color: "#c05", marginTop: 1 }}>{fmtHours(totalTimeBucketMap[b])}</div>
              )}
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
            <td style={{ textAlign: "right", fontWeight: 700, verticalAlign: "top" }}>
              <div>{r.count.toLocaleString()}</div>
              {(cumulativeReaders[r.bookId] ?? 0) > 0 && (
                <div style={{ fontSize: 10, color: "#aaa", fontWeight: 400 }}>연{cumulativeReaders[r.bookId]}명</div>
              )}
            </td>
            {buckets.map((b) => (
              <td key={b} style={{ textAlign: "right", verticalAlign: "top" }}>
                {r.buckets[b] ? (
                  <>
                    <div>{r.buckets[b].toLocaleString()}</div>
                    {(bucketReaderMap[b]?.[r.bookId] ?? 0) > 0 && (
                      <div style={{ fontSize: 10, color: "#aaa" }}>{bucketReaderMap[b][r.bookId]}명</div>
                    )}
                  </>
                ) : ""}
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
  );
}

// ── 출판사별 테이블 ──────────────────────────────────────
function PublisherTable({
  filteredPubRows, buckets, pubNameMap, byUserBucketMap,
  totalTimeBucketMap, grandTotalSeconds, activeUnit, loading, pubMapsLoaded,
}: {
  filteredPubRows: PubRow[];
  buckets: string[];
  pubNameMap: Record<string, string>;
  byUserBucketMap: Record<string, number>;
  totalTimeBucketMap: Record<string, number>;
  grandTotalSeconds: number;
  activeUnit: UnitKey;
  loading: boolean;
  pubMapsLoaded: boolean;
}) {
  if (!pubMapsLoaded && loading) {
    return <p style={{ padding: 30, color: "#888", textAlign: "center" }}>출판사 매핑 로딩 중…</p>;
  }

  return (
    <table className="ad-table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>출판사</th>
          <th style={{ textAlign: "right" }}>
            <div>합계</div>
            {grandTotalSeconds > 0 && (
              <div style={{ fontWeight: 700, fontSize: 11, color: "#c05", marginTop: 2 }}>{fmtHours(grandTotalSeconds)}</div>
            )}
          </th>
          {buckets.map((b) => (
            <th key={b} style={{ textAlign: "right" }}>
              <div>{b}</div>
              {(byUserBucketMap[b] ?? 0) > 0 && (
                <div style={{ fontWeight: 400, fontSize: 10, color: "#888", marginTop: 1 }}>
                  {activeUnit === "day" ? `${byUserBucketMap[b]}명` : `연${byUserBucketMap[b]}명`}
                </div>
              )}
              {(totalTimeBucketMap[b] ?? 0) > 0 && (
                <div style={{ fontWeight: 700, fontSize: 11, color: "#c05", marginTop: 1 }}>{fmtHours(totalTimeBucketMap[b])}</div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filteredPubRows.map((r) => {
          const name = r.pubCode ? (pubNameMap[r.pubCode] ?? r.pubCode) : "출판사 없음";
          return (
            <tr key={r.pubCode || "__none"}>
              <td>
                <strong>{name}</strong>
                {r.pubCode && (
                  <span style={{ marginLeft: 6, color: "#aaa", fontSize: 11, fontFamily: "monospace" }}>{r.pubCode}</span>
                )}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{r.count.toLocaleString()}</td>
              {buckets.map((b) => (
                <td key={b} style={{ textAlign: "right" }}>
                  {r.buckets[b] ? r.buckets[b].toLocaleString() : ""}
                </td>
              ))}
            </tr>
          );
        })}
        {!loading && filteredPubRows.length === 0 && (
          <tr>
            <td colSpan={2 + buckets.length} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
              {pubMapsLoaded ? "데이터 없음" : "출판사별 보기를 선택하면 매핑이 로드됩니다."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
