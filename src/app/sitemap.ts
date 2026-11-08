import type { MetadataRoute } from "next";

import { crawlOrigin, sitemapFor } from "@/lib/crawl-rules";

/** sitemap.xml: the home page, legal pages, and docs. User artifacts are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(crawlOrigin());
}
