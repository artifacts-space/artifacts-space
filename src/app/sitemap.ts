import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { crawlOrigin, sitemapFor } from "@/lib/crawl-rules";
import { sitemapCandidates } from "@/lib/search/search-queries";
import { artifactSitemapPaths } from "@/lib/search/search-rules";

/** Artifact pages for the sitemap, or none when the database cannot be read (the site's pages still list). */
async function artifactPaths(): Promise<string[]> {
  try {
    return artifactSitemapPaths(await sitemapCandidates());
  } catch (error) {
    console.error("[sitemap] Artifact list failed", error instanceof Error ? error.name : "unknown error");
    return [];
  }
}

/**
 * sitemap.xml: the home page, legal pages, and docs, plus public artifacts
 * whose author turned on "Show in search engines" (from accounts past the
 * new-account wait). Built per request, never at build time, so it needs no
 * database during the build and drops an artifact as soon as it is hidden.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return sitemapFor(crawlOrigin(), await artifactPaths());
}
