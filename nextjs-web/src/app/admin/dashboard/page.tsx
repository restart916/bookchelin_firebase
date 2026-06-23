"use client";

import { useEffect, useMemo, useState } from "react";

import { asNumber, listDocsByIdRange } from "@/lib/admin-db";

// ---------- date helpers ----------
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStr(): string {
  return fmtDate(new Date());
}
function subtractDays(n: number): string {
  return fmtDate(new Date(Date.now() - n * 86400000));
}
// "2026-06-22" → "20260622"
function toDauId(d: string): string {
  return d.replace(/-/g, "");
}
// "20260622" → "2026-06-22"
function fromDauId(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
}

function fmtHours(sec: number): string {
  if (!sec) return "—";
  const h = sec / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}
function fmtPerUser(sec: number, users: number): string {
  if (!sec || !users) return "—";
  const h = sec / 3600 / users;
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(h * 60)}m`;
}

interface DayRow {
  date: string;        // YYYY-MM-DD
  dau: number;
  wau: number;
  mau: number;
  dauPerMau: number;  // 0~1 ratio
  totalRevenue: number;
  readUsers: number;
  totalSec: number;
}

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export default function AdminDashboardPage() {
  const [days, setDays] = useState<Range>(14);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [docsRead, setDocsRead] = useState(0);

  async function load(n: Range) {
    setLoading(true);
    setRows([]);
    setDocsRead(0);
    try {
      const end = todayStr();
      const start = subtractDays(n);

      const [dauDocs, byUserDocs, timeDocs] = await Promise.all([
        listDocsByIdRange("analytics_dau", toDauId(start), toDauId(end)),
        listDocsByIdRange("dayly_total_time_by_user", start, end),
        listDocsByIdRange("dayly_total_time", start, end),
      ]);

      setDocsRead(dauDocs.length + byUserDocs.length + timeDocs.length);

      // Build lookup maps keyed by YYYY-MM-DD
      const dauMap: Record<string, { dau: number; wau: number; mau: number; dauPerMau: number; totalRevenue: number }> = {};
      for (const d of dauDocs) {
        dauMap[fromDauId(d.id)] = {
          dau: asNumber(d.dau),
          wau: asNumber(d.wau),
          mau: asNumber(d.mau),
          dauPerMau: asNumber(d.dauPerMau),
          totalRevenue: asNumber(d.totalRevenue),
        };
      }

      const readUsersMap: Record<string, number> = {};
      for (const d of byUserDocs) {
        const dataField = d.data as Record<string, unknown> | undefined;
        readUsersMap[d.id] =
          dataField && typeof dataField === "object" ? Object.keys(dataField).length : 0;
      }

      const timeMap: Record<string, number> = {};
      for (const d of timeDocs) {
        const tc = (d.total_count ?? {}) as Record<string, unknown>;
        timeMap[d.id] = Object.values(tc).reduce<number>((s, v) => s + asNumber(v), 0);
      }

      // Merge all dates — union of all three sources
      const allDates = new Set([
        ...Object.keys(dauMap),
        ...Object.keys(readUsersMap),
        ...Object.keys(timeMap),
      ]);

      const result: DayRow[] = [...allDates].sort().reverse().map((date) => {
        const dau = dauMap[date];
        return {
          date,
          dau: dau?.dau ?? 0,
          wau: dau?.wau ?? 0,
          mau: dau?.mau ?? 0,
          dauPerMau: dau?.dauPerMau ?? 0,
          totalRevenue: dau?.totalRevenue ?? 0,
          readUsers: readUsersMap[date] ?? 0,
          totalSec: timeMap[date] ?? 0,
        };
      });

      setRows(result);
    } catch (e) {
      console.error("대시보드 로딩 실패", e);
      alert("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(14); }, []);

  const summary = useMemo(() => {
    const yesterday = subtractDays(1);
    const latest = rows.find((r) => r.date <= yesterday) ?? rows[0];
    const totalRH = rows.reduce((s, r) => s + r.totalSec, 0);
    const totalRev = rows.reduce((s, r) => s + r.totalRevenue, 0);
    return { latest, totalRH, totalRev };
  }, [rows]);

  return (
    <div className="admin-content">
      <h1>통합 지표 대시보드</h1>
      <p className="admin-sub">
        GA4 + 독서 데이터 통합. 광고수익은 GA4 추정치 (T+24~48h 지연, 전날 기준 오전 확정).
      </p>

      {/* Period selector */}
      <div className="ad-filters">
        <span>기간</span>
        {RANGES.map((n) => (
          <button
            key={n}
            type="button"
            className={days === n ? "ad-primary" : undefined}
            disabled={loading}
            onClick={() => {
              setDays(n);
              load(n);
            }}
          >
            {n}일
          </button>
        ))}
        <span style={{ marginLeft: 12, color: "#888", fontSize: 12 }}>
          {loading ? "불러오는 중…" : `${rows.length}일 · ${docsRead}문서 읽기`}
        </span>
      </div>

      {/* Summary cards */}
      {!loading && summary.latest && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <SummaryCard
            label="DAU (어제)"
            value={summary.latest.dau ? summary.latest.dau.toLocaleString() : "—"}
            sub="일간 활성 유저"
          />
          <SummaryCard
            label="MAU"
            value={summary.latest.mau ? summary.latest.mau.toLocaleString() : "—"}
            sub={summary.latest.dauPerMau ? `스티키 ${(summary.latest.dauPerMau * 100).toFixed(1)}%` : undefined}
          />
          <SummaryCard
            label="광고수익 (어제)"
            value={summary.latest.totalRevenue ? `$${summary.latest.totalRevenue.toFixed(2)}` : "—"}
            sub="GA4 추정치"
          />
          <SummaryCard
            label="기간 총 RH"
            value={fmtHours(summary.totalRH)}
            sub={`${rows.length}일 합계`}
          />
          <SummaryCard
            label="기간 총 광고수익"
            value={`$${summary.totalRev.toFixed(2)}`}
            sub="GA4 추정치"
          />
        </div>
      )}

      {/* Data table */}
      <div style={{ overflowX: "auto" }}>
        <table className="ad-table" style={{ fontSize: 12, minWidth: 680 }}>
          <thead>
            <tr>
              <th>날짜</th>
              <th style={{ textAlign: "right" }}>DAU</th>
              <th style={{ textAlign: "right" }}>WAU</th>
              <th style={{ textAlign: "right" }}>MAU</th>
              <th style={{ textAlign: "right" }}>스티키</th>
              <th style={{ textAlign: "right" }}>Read유저</th>
              <th style={{ textAlign: "right" }}>RH</th>
              <th style={{ textAlign: "right" }}>RH/유저</th>
              <th
                style={{ textAlign: "right", cursor: "help" }}
                title="GA4 totalRevenue — AdMob 포함 광고수익. T+24~48h 지연."
              >
                광고수익 ⓘ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td style={{ textAlign: "right" }}>{r.dau || "—"}</td>
                <td style={{ textAlign: "right" }}>{r.wau || "—"}</td>
                <td style={{ textAlign: "right" }}>{r.mau || "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {r.dauPerMau > 0 ? `${(r.dauPerMau * 100).toFixed(1)}%` : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{r.readUsers || "—"}</td>
                <td style={{ textAlign: "right" }}>{fmtHours(r.totalSec)}</td>
                <td style={{ textAlign: "right" }}>{fmtPerUser(r.totalSec, r.readUsers)}</td>
                <td style={{ textAlign: "right" }}>
                  {r.totalRevenue > 0 ? `$${r.totalRevenue.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#aaa", padding: "30px 0" }}>
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

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 16px",
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
