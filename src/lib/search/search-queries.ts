import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, artifact, user } from "@/db/schema";
import { NEW_ACCOUNT_NOINDEX_DAYS } from "@/lib/access-rules";
import { accountCreatedField, accountCreatedSql, accountOwner } from "@/lib/account-age";

import { SITEMAP_ARTIFACT_LIMIT, type SitemapCandidate } from "./search-rules";

/*
 * The database side of search engine visibility: the sitemap's list. The
 * proxy's per-page check is src/lib/artifact-page-check.ts. The decisions
 * live in search-rules.ts.
 */

/**
 * The query behind sitemapCandidates: public artifacts for which someone who
 * can share them turned on "Show in search engines", from author accounts
 * past the new-account wait, newest first. Joins with an alias, so every
 * column is qualified.
 */
export function sitemapCandidatesQuery(db: Pick<ReturnType<typeof getDb>, "select">, limit: number = SITEMAP_ARTIFACT_LIMIT) {
  return db
    .select({ publicId: artifact.publicId, visibility: artifact.visibility, showInSearch: artifact.showInSearch, accountCreatedAt: accountCreatedField() })
    .from(artifact)
    .innerJoin(user, eq(user.id, artifact.userId))
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(accountOwner, eq(accountOwner.id, agent.ownerId))
    .where(
      and(
        eq(artifact.showInSearch, true),
        eq(artifact.visibility, "public"),
        sql`${accountCreatedSql} <= now() - make_interval(days => ${NEW_ACCOUNT_NOINDEX_DAYS})`,
      ),
    )
    .orderBy(desc(artifact.updatedAt))
    .limit(limit);
}

/** Artifacts the sitemap may list. The caller filters again with artifactSitemapPaths. */
export async function sitemapCandidates(): Promise<SitemapCandidate[]> {
  return sitemapCandidatesQuery(getDb());
}
