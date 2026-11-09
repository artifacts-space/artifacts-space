import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { crawlOrigin, sitemapFor } from "@/lib/crawl-rules";
import { sitemapCandidates } from "@/lib/search/search-queries";
import { artifactSitemapPaths } from "@/lib/search/search-rules";

/**
 * Longest the artifact list may take. A database that hangs (rather than
 * refusing) would otherwise stall the build's prerender until Next's own
 * cache timeout fails it; this makes it fall back to the site's pages.
 */
const ARTIFACT_LIST_TIMEOUT_MS = 10_000;

/** Rejects when `promise` takes longer than `ms`, and always clears its timer. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Timed out after ${String(ms)} ms`);
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

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
 * This holds after the build too: each background rebuild stores its own
 * lifetime with the route (Next's incremental cache keeps the latest
 * render's cache control, not only the build's), so a failed rebuild is
 * retried within a minute, and the next good one goes back to an hour.
 */
async function artifactPaths(): Promise<string[]> {
  "use cache";
  try {
    const paths = artifactSitemapPaths(await withTimeout(sitemapCandidates(), ARTIFACT_LIST_TIMEOUT_MS));
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
 * for which someone who can share them turned on "Show in search engines"
 * (from author accounts past the new-account wait). Served from the cache
 * and rebuilt in the background about once an hour, so crawlers never wait
 * on the database. A newly listed artifact can also take up to an hour to
 * appear.
 *
 * The first copy is built during `next build`, so the origin comes from the
 * build's environment (BETTER_AUTH_URL, or Vercel's production URL), as it
 * does for robots.txt.
 *
 * An artifact hidden from search engines (made private, or the setting
 * turned off) can stay listed until the next rebuild. Nothing leaks: the
 * page itself checks access and search visibility on every request (the
 * proxy's checkArtifactPage, with its 404 and X-Robots-Tag, and the page's
 * robots meta tag), so a crawler following a stale entry gets a 404 or a
 * noindex page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(crawlOrigin(), await artifactPaths());
}
