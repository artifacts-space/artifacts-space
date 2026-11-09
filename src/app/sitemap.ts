import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { crawlOrigin, sitemapFor } from "@/lib/crawl-rules";
import { sitemapCandidates } from "@/lib/search/search-queries";
import { artifactSitemapPaths } from "@/lib/search/search-rules";

/** A short, non-sensitive label for a failed read: the error's name and, when it has one, its code (such as a Postgres SQLSTATE). */
function failureLabel(error: unknown): string {
  const name = error instanceof Error ? error.name : "unknown error";
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
  return code ? `${name} (${code})` : name;
}

/**
 * Artifact pages for the sitemap, cached for an hour. When the database
 * cannot be read (as in a CI build, which has none), the sitemap lists only
 * the site's pages, cached for a minute so the next request tries again.
 */
async function artifactPaths(): Promise<string[]> {
  "use cache";
  try {
    const paths = artifactSitemapPaths(await sitemapCandidates());
    cacheLife("hours");
    return paths;
  } catch (error) {
    console.error(`[sitemap] Artifact list failed, listing the site's pages only: ${failureLabel(error)}`);
    cacheLife("minutes");
    return [];
  }
}

/**
 * sitemap.xml: the home page, legal pages, and docs, plus public artifacts
 * whose author turned on "Show in search engines" (from accounts past the
 * new-account wait). Served from the cache and rebuilt in the background
 * about once an hour, so crawlers never wait on the database. A newly
 * listed artifact can also take up to an hour to appear.
 *
 * The first copy is built during `next build`, so the origin comes from the
 * build's environment (BETTER_AUTH_URL, or Vercel's production URL), as it
 * does for robots.txt.
 *
 * An artifact hidden from search engines (made private, or the setting
 * turned off) can stay listed until the next rebuild. Nothing leaks: the
 * page itself checks access and search visibility on every request (the
 * proxy's 404 and X-Robots-Tag, and the page's robots meta tag), so a
 * crawler following a stale entry gets a 404 or a noindex page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(crawlOrigin(), await artifactPaths());
}
