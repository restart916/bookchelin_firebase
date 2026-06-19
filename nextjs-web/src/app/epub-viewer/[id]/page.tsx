import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveEpubDownloadUrl } from "@/lib/epub-storage";
import { parseViewerSettings } from "@/lib/epub-viewer";
import { EpubReader } from "./EpubReader";

// App-facing reader loaded inside the iOS WebView. Never indexed, always fresh.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "북슐랭 리더",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EpubViewerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;

  const resolved = await resolveEpubDownloadUrl(id);
  if (!resolved) notFound();

  const settings = parseViewerSettings(query);

  return <EpubReader url={resolved.url} settings={settings} />;
}
