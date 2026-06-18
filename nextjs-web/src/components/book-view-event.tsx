"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";

export function BookViewEvent({ bookId, category }: { bookId: string; category: string }) {
  useEffect(() => {
    void trackEvent("view_book", { book_id: bookId, category, source: "website" });
  }, [bookId, category]);
  return null;
}
