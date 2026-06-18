export type AnalyticsEventName =
  | "view_book"
  | "search"
  | "select_book"
  | "app_install_click"
  | "open_app_click";

export type AnalyticsParams = Record<
  string,
  string | number | boolean | undefined
>;

export function buildAnalyticsPayload(
  params: AnalyticsParams,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined,
    ),
  );
}

export async function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsParams = {},
): Promise<void> {
  if (typeof window === "undefined") return;

  const { getBookchelinAnalytics } = await import("./firebase-client");
  const analytics = await getBookchelinAnalytics();
  if (!analytics) return;

  const { logEvent } = await import("firebase/analytics");
  const payload = buildAnalyticsPayload(params);
  if (name === "search") {
    logEvent(analytics, "search", payload);
    return;
  }
  logEvent(analytics, name, payload);
}
