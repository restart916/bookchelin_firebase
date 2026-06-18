"use client";

import { ANDROID_STORE_URL, IOS_STORE_URL } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics";

type StoreCtaProps = {
  placement: string;
  bookId?: string;
  source?: string;
  compact?: boolean;
};

export function StoreCta({
  placement,
  bookId,
  source = "website",
  compact = false,
}: StoreCtaProps) {
  const eventParams = (platform: "ios" | "android") => ({
    platform,
    placement,
    book_id: bookId,
    source,
  });

  return (
    <div className={`store-cta${compact ? " store-cta--compact" : ""}`}>
      <a
        className="button"
        href={IOS_STORE_URL}
        onClick={() => void trackEvent("app_install_click", eventParams("ios"))}
      >
        App Store
      </a>
      <a
        className="button button--dark"
        href={ANDROID_STORE_URL}
        onClick={() => void trackEvent("app_install_click", eventParams("android"))}
      >
        Google Play
      </a>
    </div>
  );
}
