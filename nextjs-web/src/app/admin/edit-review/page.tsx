"use client";

import { useEffect, useMemo, useState } from "react";

import { asString, callFunction, getDocById, listDocs, type DocRow } from "@/lib/admin-db";

interface Report {
  id?: string;
  review_id?: string;
  reason?: string;
  detail?: string;
}

interface ReportQueue {
  reports?: Report[];
  pending?: unknown[];
}

export default function AdminEditReviewPage() {
  const [reviews, setReviews] = useState<DocRow[]>([]);
  const [bookTitles, setBookTitles] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [filterText, setFilterText] = useState("");
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadReviews() {
    const r = await listDocs("book_reviews");
    setReviews(r);
  }

  async function loadModerationQueue() {
    try {
      const data = await callFunction<ReportQueue>("adminListReviewReports", {});
      setReports(data.reports ?? []);
    } catch (e) {
      console.error("신고 목록 로드 실패", e);
      alert("신고 목록을 불러오지 못했습니다: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [r, siDoc, queue] = await Promise.all([
        listDocs("book_reviews"),
        getDocById("search_index", "books"),
        callFunction<ReportQueue>("adminListReviewReports", {}).catch((e) => {
          console.error("신고 목록 로드 실패", e);
          return { reports: [] } as ReportQueue;
        }),
      ]);
      if (!active) return;
      setReviews(r);
      const list = (siDoc && Array.isArray(siDoc.books) ? siDoc.books : []) as { id?: string; title?: string }[];
      const map: Record<string, string> = {};
      for (const b of list) if (b.id) map[b.id] = asString(b.title);
      setBookTitles(map);
      setReports(queue.reports ?? []);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  function reportsFor(review: DocRow): Report[] {
    return reports.filter((rep) => rep.review_id === review.id);
  }

  function reportCount(review: DocRow): number {
    return reportsFor(review).length || Number(review.report_count) || 0;
  }

  const filteredReviews = useMemo(() => {
    let list = reviews;
    if (onlyVisible) list = list.filter((r) => r.hide !== "1");
    const q = filterText.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const title = (bookTitles[asString(r.book_id)] ?? "").toLowerCase();
        return (
          title.includes(q) ||
          asString(r.review).toLowerCase().includes(q) ||
          asString(r.user_name).toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [reviews, onlyVisible, filterText, bookTitles]);

  async function moderate(review: DocRow, action: string) {
    try {
      await callFunction("adminModerateReview", { review_id: review.id, action });
      await Promise.all([loadModerationQueue(), loadReviews()]);
    } catch (e) {
      console.error("리뷰 운영 처리 실패", e);
      alert("처리 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="admin-content">
      <h1>리뷰 모더레이션</h1>
      <p className="admin-sub">신고된 리뷰를 검토하고 숨김/복원/작성 제한을 처리합니다.</p>

      <div className="ad-filters">
        <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="책 제목·리뷰·작성자 검색" />
        <label>
          <input type="checkbox" checked={onlyVisible} onChange={(e) => setOnlyVisible(e.target.checked)} /> 숨김 제외하고 보기
        </label>
        <span>
          표시 {filteredReviews.length} / 전체 {reviews.length}
        </span>
        <span className="ad-badge ad-badge--hidden" style={{ background: "#fde2e1", color: "#c0392b" }}>
          미처리 신고 {reports.length}
        </span>
      </div>

      {filteredReviews.map((review) => {
        const count = reportCount(review);
        const hidden = review.hide === "1";
        return (
          <section
            key={review.id}
            className="ad-form"
            style={{ borderColor: "#e6e8eb", opacity: hidden ? 0.55 : 1, display: "flex", justifyContent: "space-between", gap: 16 }}
          >
            <div>
              <strong style={{ fontSize: 15 }}>{bookTitles[asString(review.book_id)] || "(제목 미확인)"}</strong>
              <br />
              <small style={{ color: "#999" }}>{asString(review.book_id)}</small>
              <div style={{ margin: "6px 0" }}>★ {asString(review.rating)}</div>
              <div>{asString(review.review)}</div>
              <small style={{ color: "#888" }}>{asString(review.user_name)}</small>
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {hidden && <span className="ad-badge ad-badge--hidden">숨김</span>}
                {review.moderation_status === "pending" && (
                  <span className="ad-badge" style={{ background: "#dceeff", color: "#245b88" }}>
                    검토 대기
                  </span>
                )}
                {count > 0 && (
                  <span className="ad-badge" style={{ background: "#fde2e1", color: "#c0392b" }}>
                    신고 {count}건
                  </span>
                )}
              </div>
              {reportsFor(review).map((rep, i) => (
                <div key={rep.id ?? i} style={{ marginTop: 4, color: "#b00020", fontSize: 12 }}>
                  {rep.reason}
                  {rep.detail ? ` — ${rep.detail}` : ""}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end", alignItems: "flex-start" }}>
              <button type="button" onClick={() => moderate(review, hidden ? "restore" : "hide")}>
                {hidden ? "다시 보이기" : "숨기기"}
              </button>
              {count > 0 && (
                <button type="button" onClick={() => moderate(review, "dismiss")}>
                  신고 종결
                </button>
              )}
              <button type="button" className="ad-danger" onClick={() => moderate(review, "ban")}>
                작성 제한
              </button>
              <button type="button" onClick={() => moderate(review, "unban")}>
                제한 해제
              </button>
            </div>
          </section>
        );
      })}
      {loaded && filteredReviews.length === 0 && (
        <p style={{ textAlign: "center", color: "#aaa", padding: 30 }}>표시할 리뷰가 없습니다.</p>
      )}
      {!loaded && <p style={{ color: "#aaa" }}>불러오는 중…</p>}
    </div>
  );
}
