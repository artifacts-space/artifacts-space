import { eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db";
import { artifactVersion } from "@/db/schema";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";

/**
 * Cached reads of approved versions, keyed by version id and save time.
 *
 * Why this is safe: these functions are only called after the uncached access
 * check (src/lib/access.ts) has decided that this viewer reads this exact
 * approved version, and it passes the version's save time from the same
 * query. A version that changes (a merged save) gets a new save time, so a
 * new key. Only link and public artifacts have approved versions that are
 * served (versionToServe); private and team artifacts are always read fresh
 * from their row and never go through this cache. When an artifact turns
 * private or is deleted, the access check refuses before the cache is
 * reached, so a stale entry can never be served. Invalidation
 * (forgetArtifactCache) only frees memory sooner.
 */

/** What a reader of an approved version sees. */
export interface CachedVersionView {
  title: string;
  icon: string | null;
  theme: StoredArtifactTheme | null;
  cover: string | null;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  source: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
}

/** The cache tag for everything cached about one artifact. */
export function artifactCacheTag(artifactId: string): string {
  return `artifact:${artifactId}`;
}

/**
 * An approved version in full, by id, or null. `savedAt` (ISO) is part of the
 * cache key only. Call only after the access check chose this version.
 */
export async function cachedVersionView(versionId: string, savedAt: string): Promise<CachedVersionView | null> {
  "use cache";
  cacheLife("days");
  const [row] = await getDb().select().from(artifactVersion).where(eq(artifactVersion.id, versionId)).limit(1);
  if (!row) return null;
  cacheTag(artifactCacheTag(row.artifactId), `version:${versionId}:${savedAt}`);
  const { title, icon, theme, cover, summary, content, kind, language, source, metadata } = row;
  // savedAt, not createdAt: files attached up to the version's last save belong to it. No project: it is not versioned.
  return { title, icon, theme, cover, summary, content, kind, language, source, metadata, updatedAt: row.savedAt };
}

/**
 * Drops cached versions of an artifact after a new approval, a visibility
 * change, or a delete. Correctness never depends on it (see above), so a
 * call outside a request, where Next cannot revalidate, is logged and ignored.
 */
export function forgetArtifactCache(artifactId: string): void {
  try {
    revalidateTag(artifactCacheTag(artifactId), { expire: 0 });
  } catch (error) {
    console.warn("[versions] Cache tag not revalidated", error instanceof Error ? error.message.slice(0, 120) : "unknown error");
  }
}
