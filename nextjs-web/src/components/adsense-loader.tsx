"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

// epub-viewer는 앱 웹뷰 전용 — AdMob 전면광고가 이미 돌고 있어 AdSense Auto Ads와 중복됨.
export function AdSenseLoader() {
  const pathname = usePathname();
  if (pathname.startsWith("/epub-viewer")) return null;
  return (
    <Script
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1514313371293640"
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
