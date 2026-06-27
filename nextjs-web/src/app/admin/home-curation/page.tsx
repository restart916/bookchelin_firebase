"use client";

import { useCallback, useEffect, useState } from "react";

import { asString, getDocById, getDocsByIds, setDocAt } from "@/lib/admin-db";

interface BookLite {
  id: string;
  title: string;
  image: string;
}

// trending = [{book_id, reader_count}], discover = [id, ...], exclude = [id, ...]
function toIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && "book_id" in x) {
        return asString((x as { book_id: unknown }).book_id);
      }
      return "";
    })
    .filter(Boolean);
}

export default function HomeCurationPage() {
  const [trending, setTrending] = useState<string[]>([]);
  const [discover, setDiscover] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [booksById, setBooksById] = useState<Record<string, BookLite>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, cfg] = await Promise.all([
        getDocById("home_dynamic", "current"),
        getDocById("home_dynamic_config", "main"),
      ]);
      const tr = toIds(cur?.trending);
      const dc = toIds(cur?.discover);
      const ex = toIds(cfg?.exclude);
      setTrending(tr);
      setDiscover(dc);
      setExclude(ex);

      const ids = Array.from(new Set([...tr, ...dc, ...ex]));
      if (ids.length) {
        const docs = await getDocsByIds("books", ids);
        const map: Record<string, BookLite> = {};
        for (const d of docs) {
          map[d.id] = { id: d.id, title: asString(d.title), image: asString(d.image_url) };
        }
        setBooksById(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function writeExclude(next: string[], note: string) {
    setBusy(true);
    setMsg(`${note} 적용 중 — 홈 편성 재생성 후 자동 새로고침합니다…`);
    try {
      // home_dynamic_config 쓰기 → 트리거(regenerate_home_dynamic_on_config_write)가
      // home_dynamic/current 를 재생성(제외 반영 + 빈 자리 자동 백필).
      await setDocAt("home_dynamic_config", "main", { exclude: next }, true);
      setExclude(next);
      await new Promise((r) => setTimeout(r, 5000)); // 재생성 대기
      await load();
      setMsg("반영됐어요.");
    } catch (e) {
      setMsg("실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  function removeBook(id: string) {
    if (exclude.includes(id)) return;
    const b = booksById[id];
    if (
      !confirm(
        `"${b?.title || id}" 을(를) 지금 인기 / 오늘의 발견에서 제외할까요?\n자동 편성에서 영구 제외되고, 빈 자리는 다음 순위 책으로 자동 채워집니다.`,
      )
    )
      return;
    // 즉시 화면에서 제거(낙관적) → 재생성 후 백필 반영
    setTrending((p) => p.filter((x) => x !== id));
    setDiscover((p) => p.filter((x) => x !== id));
    writeExclude([...exclude, id], "제외");
  }

  function restoreBook(id: string) {
    writeExclude(exclude.filter((x) => x !== id), "복구");
  }

  function bookCard(id: string, action: "remove" | "restore") {
    const b = booksById[id];
    return (
      <div
        key={id}
        style={{
          width: 110,
          border: "1px solid #eee",
          borderRadius: 8,
          padding: 8,
          textAlign: "center",
          background: "#fff",
        }}
      >
        {b?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.image}
            referrerPolicy="no-referrer"
            alt=""
            width={84}
            height={120}
            style={{ objectFit: "cover", borderRadius: 4, border: "1px solid #f0f0f0" }}
          />
        ) : (
          <div style={{ width: 84, height: 120, margin: "0 auto", background: "#f5f5f5", borderRadius: 4 }} />
        )}
        <div style={{ fontSize: 11, margin: "6px 0", height: 30, overflow: "hidden", lineHeight: "15px" }}>
          {b?.title || id}
        </div>
        {action === "remove" ? (
          <button type="button" className="ad-danger" disabled={busy} onClick={() => removeBook(id)}>
            빼기
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => restoreBook(id)}>
            복구
          </button>
        )}
      </div>
    );
  }

  const row = (ids: string[], action: "remove" | "restore") => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {ids.length === 0 ? <span style={{ color: "#aaa", fontSize: 13 }}>없음</span> : ids.map((id) => bookCard(id, action))}
    </div>
  );

  return (
    <div className="admin-content">
      <h1>지금 인기 · 오늘의 발견 (자동 편성)</h1>
      <p className="admin-sub">
        매일 자동 큐레이션됩니다. 마음에 안 드는 책은 <b>빼기</b>로 제외하면 자동 편성에서 영구 제외되고
        빈 자리는 다음 순위 책으로 채워집니다. (앱 반영: Android는 홈 재진입 시, iOS는 앱 재실행 시)
      </p>

      <div className="ad-filters">
        <button type="button" disabled={loading || busy} onClick={load}>
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
        {msg && <span style={{ marginLeft: 10, fontSize: 13, color: busy ? "#4a7cf4" : "#2a8a3e" }}>{msg}</span>}
      </div>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16 }}>🔥 지금 인기 ({trending.length})</h2>
        {row(trending, "remove")}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16 }}>✨ 오늘의 발견 ({discover.length})</h2>
        {row(discover, "remove")}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16 }}>🚫 제외된 책 ({exclude.length})</h2>
        <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>여기 있는 책은 자동 편성에서 빠집니다. 복구하면 다시 후보가 됩니다.</p>
        {row(exclude, "restore")}
      </section>
    </div>
  );
}
