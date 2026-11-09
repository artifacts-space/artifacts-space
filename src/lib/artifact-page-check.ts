import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, artifact, user } from "@/db/schema";
import { canReadSubject } from "@/lib/access";
import { accountCreatedField, accountOwner } from "@/lib/account-age";
import { isPublicId } from "@/lib/public-id";
import { isSearchIndexable } from "@/lib/search/search-rules";

/*
 * The artifact page check in src/proxy.ts: may this viewer read the page,
 * and may search engines index it. One query reads everything both answers
 * need: who can read the artifact, its search setting, and how old its
 * author's account is (the owner's, for an agent; see src/lib/account-age.ts).
 */

/**
 * The query behind checkArtifactPage. Joins with an alias, so every column
 * is qualified (see the correlated-subquery tripwire in AGENTS.md). The joins
 * add at most one row: user and agent are keyed by the user id, owner by its id.
 */
export function pageCheckQuery(db: Pick<ReturnType<typeof getDb>, "select">, publicId: string) {
  return db
    .select({ userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId, showInSearch: artifact.showInSearch, accountCreatedAt: accountCreatedField() })
    .from(artifact)
    .leftJoin(user, eq(user.id, artifact.userId))
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(accountOwner, eq(accountOwner.id, agent.ownerId))
    .where(eq(artifact.publicId, publicId))
    .limit(1);
}

/** What the proxy needs to answer an artifact page. */
export interface ArtifactPageCheck {
  /** Whether this viewer may read it (canReadArtifact's rule). */
  readable: boolean;
  /** Whether search engines may index it (isSearchIndexable). */
  indexable: boolean;
}

const missing: ArtifactPageCheck = { readable: false, indexable: false };

/**
 * The read check and the search check for /artifact/<publicId>, in one
 * indexed query. `resolveViewer` runs only for private and team artifacts,
 * as in canReadArtifact. Unknown ids are neither readable nor indexable.
 */
export async function checkArtifactPage(publicId: string, resolveViewer: () => Promise<string | null>): Promise<ArtifactPageCheck> {
  if (!isPublicId(publicId)) return missing;
  const [row] = await pageCheckQuery(getDb(), publicId);
  if (!row) return missing;
  const readable = await canReadSubject(row, resolveViewer);
  return { readable, indexable: readable && isSearchIndexable(row, row.accountCreatedAt) };
}
