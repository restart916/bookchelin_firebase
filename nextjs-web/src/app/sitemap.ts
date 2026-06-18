import type { MetadataRoute } from "next";

import { getVisibleBooks } from "@/lib/book-repository";
import { buildSitemapEntries } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await getVisibleBooks());
}
