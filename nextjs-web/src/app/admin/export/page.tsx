"use client";

import { useEffect, useState } from "react";

import { asString, listDocs } from "@/lib/admin-db";

interface ExportRow {
  bookId: string;
  bookTitle: string;
  description: string;
}

export default function AdminExportPage() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const books = await listDocs("books", { field: "order", dir: "asc" });
      if (!active) return;
      setRows(
        books.map((b) => ({
          bookId: b.id,
          bookTitle: asString(b.title),
          description: asString(b.description),
        })),
      );
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  function downloadCsv() {
    const header = ["bookId", "bookTitle", "description"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...rows.map((r) => [r.bookId, r.bookTitle, r.description].map(escape).join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `books-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-content">
      <h1>책 내보내기</h1>
      <p className="admin-sub">
        총 <b>{rows.length}</b>권 {loaded ? "" : "(불러오는 중…)"}
        <button type="button" className="ad-primary" style={{ marginLeft: 12 }} disabled={!loaded} onClick={downloadCsv}>
          CSV 다운로드
        </button>
      </p>

      <table className="ad-table">
        <thead>
          <tr>
            <th>bookId</th>
            <th>bookTitle</th>
            <th>description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bookId}>
              <td>{r.bookId}</td>
              <td>{r.bookTitle}</td>
              <td>{r.description}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "#aaa", padding: 30 }}>
                {loaded ? "책이 없습니다." : "불러오는 중…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
