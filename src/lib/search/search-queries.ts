import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agent, artifact, user } from "@/db/schema";
import { NEW_ACCOUNT_NOINDEX_DAYS } from "@/lib/access-rules";

import { SITEMAP_ARTIFACT_LIMIT, type SitemapCandidate } from "./search-rules";

/*
 * The database side of search engine visibility: the sitemap's list. The
 * proxy's per-page check is src/lib/artifact-page-check.ts. The decisions
 * live in search-rules.ts.
 */

const owner = alias(user, "owner");

/** When the author's account was created: the owner's, for an agent. */
const accountCreated = sql<Date>`coalesce(${owner.createdAt}, ${user.createdAt})`.mapWith((value: string | Date) => new Date(value));

/**
 * The query behind sitemapCandidates: public artifacts whose author turned on
 * "Show in search engines" and whose account is past the new-account wait,
 * newest first. Joins with an alias, so every column is qualified.
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
