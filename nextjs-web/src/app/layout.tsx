import type { Metadata } from "next";

import { AnalyticsProvider } from "@/components/analytics-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "북슐랭 | 무제한 무료 독서 앱",
    template: "%s | 북슐랭",
  },
  description: "문학부터 지식교양까지, 좋은 전자책을 북슐랭 앱에서 무료로 읽어보세요.",
  applicationName: "북슐랭",
  alternates: { canonical: "/" },
  appleWebApp: { capable: true, title: "북슐랭" },
  other: { "apple-itunes-app": "app-id=1544648278" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AnalyticsProvider />
        <SiteHeader />
        <main className="site-main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
