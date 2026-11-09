import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agent, artifact, user } from "@/db/schema";
import { NEW_ACCOUNT_NOINDEX_DAYS } from "@/lib/access-rules";
import { accountCreatedAt } from "@/lib/account-age";
import { isPublicId } from "@/lib/public-id";

import { isSearchIndexable, showsInSearch, SITEMAP_ARTIFACT_LIMIT, type SitemapCandidate } from "./search-rules";

/*
 * The database side of search engine visibility: the proxy's per-page check
 * and the sitemap's list. The decisions live in search-rules.ts.
 */

const owner = alias(user, "owner");

/** When the author's account was created: the owner's, for an agent. */
const accountCreated = sql<Date>`coalesce(${owner.createdAt}, ${user.createdAt})`.mapWith((value: string | Date) => new Date(value));

/**
 * The query behind sitemapCandidates: public artifacts for which someone who
 * can share them turned on "Show in search engines", from author accounts
 * past the new-account wait, newest first. Joins with an alias, so every
 * column is qualified.
 */
export function sitemapCandidatesQuery(db: Pick<ReturnType<typeof getDb>, "select">, limit: number = SITEMAP_ARTIFACT_LIMIT) {
  return db
    .select({ publicId: artifact.publicId, visibility: artifact.visibility, showInSearch: artifact.showInSearch, accountCreatedAt: accountCreated })
    .from(artifact)
    .innerJoin(user, eq(user.id, artifact.userId))
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(owner, eq(owner.id, agent.ownerId))
    .where(
      and(
        eq(artifact.showInSearch, true),
        eq(artifact.visibility, "public"),
        sql`coalesce(${owner.createdAt}, ${user.createdAt}) <= now() - make_interval(days => ${NEW_ACCOUNT_NOINDEX_DAYS})`,
      ),
    )
    .orderBy(desc(artifact.updatedAt))
    .limit(limit);
}

/** Artifacts the sitemap may list. The caller filters again with artifactSitemapPaths. */
export async function sitemapCandidates(): Promise<SitemapCandidate[]> {
  return sitemapCandidatesQuery(getDb());
}

/**
 * Whether search engines may index the page at /artifact/<publicId>, for the
 * proxy's X-Robots-Tag header. One indexed lookup, plus the author's account
 * age only for artifacts whose setting counts. Unknown ids are never indexable.
 */
export async function isPageSearchIndexable(publicId: string): Promise<boolean> {
  if (!isPublicId(publicId)) return false;
  const [row] = await getDb()
    .select({ userId: artifact.userId, visibility: artifact.visibility, showInSearch: artifact.showInSearch })
    .from(artifact)
    .where(eq(artifact.publicId, publicId))
    .limit(1);
  if (!row || !showsInSearch(row)) return false;
  return isSearchIndexable(row, await accountCreatedAt(row.userId));
}
