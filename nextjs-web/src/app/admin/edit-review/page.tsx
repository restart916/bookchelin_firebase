"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DocumentSnapshot } from "firebase/firestore";
import {
  asString,
  callFunction,
  countDocs,
  getDocById,
  getDocsByIds,
  listDocsPaginated,
  type DocRow,
} from "@/lib/admin-db";

interface Report {
  id?: string;
  review_id?: string;
  reporter_uid?: string;
  reason?: string;
  detail?: string;
  status?: string;    // 'open' | 'reviewed' | 'dismissed'
}

interface ReportQueue {
  reports?: Report[];
  closedReports?: Report[];
  pending?: unknown[];
}

const PAGE_SIZE = 25;

const REASON_LABEL: Record<string, string> = {
  spam: "스팸",
  offensive: "공격적",
  harassment: "괴롭힘",
  inappropriate: "부적절",
  other: "기타",
};

export default function AdminEditReviewPage() {
  // ── view state ─────────────────────────────────────────────────
  const [reviews, setReviews] = useState<DocRow[]>([]);
  const [cursors, setCursors] = useState<Array<DocumentSnapshot | null>>([null]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── filter state ───────────────────────────────────────────────
  const [filterText, setFilterText] = useState("");
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [onlyReported, setOnlyReported] = useState(false);

  // ── data ───────────────────────────────────────────────────────
  const [bookTitles, setBookTitles] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);         // open only
  const [closedReports, setClosedReports] = useState<Report[]>([]); // reviewed + dismissed

  // ── refs ───────────────────────────────────────────────────────
  const isMounted = useRef(true);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── derived ────────────────────────────────────────────────────

  const matchingBookIds = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return [] as string[];
    return Object.entries(bookTitles)
      .filter(([, t]) => t.toLowerCase().includes(q))
      .map(([id]) => id)
      .slice(0, 5);
  }, [filterText, bookTitles]);

  const bookMode = filterText.trim().length > 0 && matchingBookIds.length > 0;

  const pendingReportCount = useMemo(
    () => new Set(reports.map((r) => r.review_id)).size,
    [reports],
  );

  const filteredReviews = useMemo(() => {
    let list = reviews;
    if (onlyVisible) list = list.filter((r) => r.hide !== "1");
    if (onlyReported && matchingBookIds.length > 0) {
      const ids = new Set(matchingBookIds);
      list = list.filter((r) => ids.has(asString(r.book_id)));
    }
    return list;
  }, [reviews, onlyVisible, onlyReported, matchingBookIds]);

  // ── load helpers ───────────────────────────────────────────────

  async function _loadNormalPage(
    targetPage: number,
    cursorList: Array<DocumentSnapshot | null>,
  ) {
    setLoading(true);
    try {
      const result = await listDocsPaginated("book_reviews", {
        pageSize: PAGE_SIZE,
        startAfter: cursorList[targetPage] ?? null,
      });
      if (!isMounted.current) return;
      setReviews(result.docs);
      setHasMore(result.hasMore);
      if (result.lastDoc) {
        setCursors((prev) => {
          const next = [...prev];
          next[targetPage + 1] = result.lastDoc;
          return next;
        });
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function _loadReportedReviews(reps: Report[]) {
    const ids = [
      ...new Set(reps.map((r) => r.review_id).filter(Boolean)),
    ] as string[];
    setLoading(true);
    try {
      const docs = ids.length > 0 ? await getDocsByIds("book_reviews", ids) : [];
      if (!isMounted.current) return;
      setReviews(docs);
      setHasMore(false);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function _loadBookReviews(bookIds: string[]) {
    setLoading(true);
    try {
      const chunks = await Promise.all(
        bookIds.map((id) =>
          listDocsPaginated("book_reviews", {
            pageSize: 50,
            whereClauses: [["book_id", "==", id]],
          }).then((r) => r.docs),
        ),
      );
      if (!isMounted.current) return;
      setReviews(chunks.flat());
      setHasMore(false);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  function _load(opts: {
    page: number;
    cursors: Array<DocumentSnapshot | null>;
    isReported: boolean;
    bookMode: boolean;
    bookIds: string[];
    reports: Report[];
  }) {
    if (opts.isReported) {
      _loadReportedReviews(opts.reports);
    } else if (opts.bookMode) {
      _loadBookReviews(opts.bookIds);
    } else {
      _loadNormalPage(opts.page, opts.cursors);
    }
  }

  // ── initial mount ──────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true;
    (async () => {
      const [siDoc, queue, count] = await Promise.all([
        getDocById("search_index", "books"),
        callFunction<ReportQueue>("adminListReviewReports", {}).catch((e) => {
          console.error("신고 목록 로드 실패", e);
          return {} as ReportQueue;
        }),
        countDocs("book_reviews"),
      ]);
      if (!isMounted.current) return;

      const list = (
        siDoc && Array.isArray(siDoc.books) ? siDoc.books : []
      ) as { id?: string; title?: string }[];
      const map: Record<string, string> = {};
      for (const b of list) if (b.id) map[b.id] = asString(b.title);
      setBookTitles(map);

      const reps = queue.reports ?? [];
      const closed = queue.closedReports ?? [];
      setReports(reps);
      setClosedReports(closed);
      setTotalCount(count);
      setLoaded(true);

      await _loadNormalPage(0, [null]);
    })();
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ── event handlers ─────────────────────────────────────────────

  function handleFilterTextChange(value: string) {
    setFilterText(value);
    if (onlyReported) return;
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => {
      const q = value.trim().toLowerCase();
      const freshIds = Object.entries(bookTitles)
        .filter(([, t]) => t.toLowerCase().includes(q))
        .map(([id]) => id)
        .slice(0, 5);
      const freshBookMode = q.length > 0 && freshIds.length > 0;
      const newCursors = [null] as Array<DocumentSnapshot | null>;
      setCursors(newCursors);
      setPage(0);
      setHasMore(false);
      _load({
        page: 0,
        cursors: newCursors,
        isReported: false,
        bookMode: freshBookMode,
        bookIds: freshIds,
        reports,
      });
    }, 300);
  }

  function handleToggleReported() {
    const newReported = !onlyReported;
    setOnlyReported(newReported);
    setPage(0);
    const newCursors = [null] as Array<DocumentSnapshot | null>;
    setCursors(newCursors);
    setHasMore(false);
    _load({
      page: 0,
      cursors: newCursors,
      isReported: newReported,
      bookMode,
      bookIds: matchingBookIds,
      reports,
    });
  }

  function handleNextPage() {
    const newPage = page + 1;
    setPage(newPage);
    _loadNormalPage(newPage, cursors);
  }

  function handlePrevPage() {
    if (page === 0) return;
    const newPage = page - 1;
    setPage(newPage);
    _loadNormalPage(newPage, cursors);
  }

  // ── moderation ─────────────────────────────────────────────────

  async function moderate(review: DocRow, action: string) {
    try {
      await callFunction("adminModerateReview", { review_id: review.id, action });
      const data = await callFunction<ReportQueue>(
        "adminListReviewReports",
        {},
      ).catch(() => ({}) as ReportQueue);
      const freshReports = data.reports ?? [];
      const freshClosed = data.closedReports ?? [];
      if (isMounted.current) {
        setReports(freshReports);
        setClosedReports(freshClosed);
      }
      _load({
        page,
        cursors,
        isReported: onlyReported,
        bookMode,
        bookIds: matchingBookIds,
        reports: freshReports,
      });
    } catch (e) {
      console.error("리뷰 운영 처리 실패", e);
      alert("처리 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ── utils ──────────────────────────────────────────────────────

  function openReportsFor(review: DocRow): Report[] {
    return reports.filter((r) => r.review_id === review.id);
  }

  function closedReportsFor(review: DocRow): Report[] {
    return closedReports.filter((r) => r.review_id === review.id);
  }

  function fmtReason(rep: Report): string {
    const label = REASON_LABEL[rep.reason ?? ""] ?? rep.reason ?? "";
    return rep.detail ? `${label} — ${rep.detail}` : label;
  }

  // ── render ─────────────────────────────────────────────────────

  const statusLabel = loading
    ? "로딩 중…"
    : onlyReported
      ? `신고 리뷰 ${filteredReviews.length}건`
      : bookMode
        ? `「${filterText.trim()}」 ${filteredReviews.length}건`
        : `${filteredReviews.length}건 / ${page + 1}페이지${totalCount !== null ? ` (전체 ${totalCount.toLocaleString()}건)` : ""}`;

  return (
    <div className="admin-content">
      <h1>리뷰 모더레이션</h1>
      <p className="admin-sub">
        신고된 리뷰를 검토하고 숨김/복원/작성 제한을 처리합니다.
      </p>

      <div className="ad-filters">
        <input
          value={filterText}
          onChange={(e) => handleFilterTextChange(e.target.value)}
          placeholder="책 제목 검색 (부분 일치)"
        />
        <label>
          <input
            type="checkbox"
            checked={onlyVisible}
            onChange={(e) => setOnlyVisible(e.target.checked)}
          />{" "}
          숨김 제외하고 보기
        </label>
        <button
          type="button"
          onClick={handleToggleReported}
          style={{
            background: onlyReported ? "#c0392b" : "#f0f0f0",
            color: onlyReported ? "#fff" : "#333",
            border: "none",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontWeight: onlyReported ? 600 : 400,
          }}
        >
          미처리 신고만
          {pendingReportCount > 0 && (
            <span
              style={{
                marginLeft: 6,
                background: onlyReported ? "rgba(255,255,255,0.25)" : "#fde2e1",
                color: onlyReported ? "#fff" : "#c0392b",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 12,
              }}
            >
              {pendingReportCount}
            </span>
          )}
        </button>
        <span style={{ color: "#888", fontSize: 13 }}>{statusLabel}</span>
      </div>

      {filterText.trim() && matchingBookIds.length === 0 && (
        <p style={{ color: "#aaa", padding: "6px 0", fontSize: 13 }}>
          일치하는 책 없음 — 정확한 제목 일부를 입력하세요.
        </p>
      )}

      {!loaded && (
        <p style={{ color: "#aaa", padding: "24px 0" }}>불러오는 중…</p>
      )}

      {filteredReviews.map((review) => {
        const openReps = openReportsFor(review);
        const closedReps = closedReportsFor(review);
        const count = openReps.length || Number(review.report_count) || 0;
        const hidden = review.hide === "1";
        const authorUid = asString(review.user_uid);

        return (
          <section
            key={review.id}
            className="ad-form"
            style={{
              borderColor: "#e6e8eb",
              opacity: hidden ? 0.55 : 1,
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 15 }}>
                {bookTitles[asString(review.book_id)] || "(제목 미확인)"}
              </strong>
              <br />
              <small style={{ color: "#999" }}>book: {asString(review.book_id)}</small>
              <div style={{ margin: "6px 0" }}>★ {asString(review.rating)}</div>
              <div style={{ wordBreak: "break-word" }}>{asString(review.review)}</div>
              {/* 작성자 닉네임 + uid */}
              <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                {asString(review.user_name)}
                {authorUid && (
                  <span style={{ marginLeft: 8, color: "#bbb", fontSize: 11, fontFamily: "monospace" }}>
                    uid:{authorUid}
                  </span>
                )}
              </div>

              {/* 상태 뱃지 */}
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {hidden && <span className="ad-badge ad-badge--hidden">숨김</span>}
                {review.moderation_status === "pending" && (
                  <span className="ad-badge" style={{ background: "#dceeff", color: "#245b88" }}>
                    검토 대기
                  </span>
                )}
                {/* 미처리 신고 (open) */}
                {openReps.length > 0 && (
                  <span className="ad-badge" style={{ background: "#fde2e1", color: "#c0392b" }}>
                    미처리 신고 {openReps.length}건
                  </span>
                )}
                {/* 처리된 신고 (reviewed/dismissed) */}
                {closedReps.length > 0 && (
                  <span className="ad-badge" style={{ background: "#f0f0f0", color: "#888" }}>
                    처리된 신고 {closedReps.length}건
                  </span>
                )}
              </div>

              {/* 미처리 신고 상세 (빨간색) */}
              {openReps.map((rep, i) => (
                <div key={rep.id ?? `o${i}`} style={{ marginTop: 4, color: "#b00020", fontSize: 12 }}>
                  {fmtReason(rep)}
                  {rep.reporter_uid && (
                    <span style={{ marginLeft: 6, color: "#d9534f", fontFamily: "monospace", fontSize: 11 }}>
                      신고자:{rep.reporter_uid}
                    </span>
                  )}
                </div>
              ))}

              {/* 처리된 신고 상세 (회색) */}
              {closedReps.length > 0 && (
                <div style={{ marginTop: 4, borderTop: "1px solid #f0f0f0", paddingTop: 4 }}>
                  {closedReps.map((rep, i) => (
                    <div key={rep.id ?? `c${i}`} style={{ color: "#bbb", fontSize: 11, display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ color: rep.status === "dismissed" ? "#ccc" : "#aaa" }}>
                        [{rep.status === "dismissed" ? "종결" : "처리"}]
                      </span>
                      <span>{fmtReason(rep)}</span>
                      {rep.reporter_uid && (
                        <span style={{ fontFamily: "monospace" }}>신고자:{rep.reporter_uid}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                justifyContent: "flex-end",
                alignItems: "flex-start",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => moderate(review, hidden ? "restore" : "hide")}
              >
                {hidden ? "다시 보이기" : "숨기기"}
              </button>
              {count > 0 && (
                <button type="button" onClick={() => moderate(review, "dismiss")}>
                  신고 종결
                </button>
              )}
              <button
                type="button"
                className="ad-danger"
                onClick={() => moderate(review, "ban")}
              >
                작성 제한
              </button>
              <button type="button" onClick={() => moderate(review, "unban")}>
                제한 해제
              </button>
            </div>
          </section>
        );
      })}

      {loaded && !loading && filteredReviews.length === 0 && (
        <p style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
          표시할 리뷰가 없습니다.
        </p>
      )}

      {!onlyReported && !bookMode && loaded && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "20px 0",
          }}
        >
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={handlePrevPage}
          >
            ← 이전
          </button>
          <span style={{ color: "#555" }}>{page + 1} 페이지</span>
          <button
            type="button"
            disabled={!hasMore || loading}
            onClick={handleNextPage}
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}
