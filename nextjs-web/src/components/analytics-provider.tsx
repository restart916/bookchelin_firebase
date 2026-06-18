"use client";

import { useEffect } from "react";

import { getBookchelinAnalytics } from "@/lib/firebase-client";

export function AnalyticsProvider() {
  useEffect(() => {
    void getBookchelinAnalytics();
  }, []);

  return null;
}
