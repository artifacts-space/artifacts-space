import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "@/db/oauth-schema";
import { agent, apiToken, teamMember } from "@/db/schema";
import { parseTeamRole } from "@/lib/teams/roles";
import { agentsToHandOver, pickTransferOwner } from "@/lib/sharing/transfer-rules";

/**
 * Agents of people who left a team. An agent's token usually lives on the
 * machine of the person who added it, so after they leave it would keep
 * reading the team's work for them. After every departure, each agent whose
 * owner is gone is handed to the team's longest-standing owner (the same
 * person who takes over the departed member's shared artifacts), its tokens
 * and any OAuth grants are revoked, and it is marked as handed over until a
 * manager creates a new token. Idempotent, like reconcileTeamArtifacts.
 */

type Db = Pick<ReturnType<typeof getDb>, "update">;

/** Revokes every active token of these agents. Revoked tokens never authenticate (authenticateApiToken). */
export function revokeAgentTokensQuery(db: Db, agentIds: string[], now: Date) {
  return db
    .update(apiToken)
    .set({ revokedAt: now })
    .where(and(inArray(apiToken.userId, agentIds), isNull(apiToken.revokedAt)));
}

/** Gives these agents a new owner (null when the team has no owner or admin) and marks them handed over. */
export function handOverAgentsQuery(db: Db, agentIds: string[], newOwnerId: string | null, now: Date) {
  return db.update(agent).set({ ownerId: newOwnerId, handedOverAt: now }).where(inArray(agent.userId, agentIds));
}

/** Agents never sign in, so they should hold no OAuth grants; any that exist go too. */
async function deleteOAuthGrants(agentIds: string[]) {
  const db = getDb();
  await Promise.all([
    db.delete(oauthAccessToken).where(inArray(oauthAccessToken.userId, agentIds)),
    db.delete(oauthRefreshToken).where(inArray(oauthRefreshToken.userId, agentIds)),
    db.delete(oauthConsent).where(inArray(oauthConsent.userId, agentIds)),
  ]);
}

/**
 * Hands every agent whose owner left the team to its longest-standing owner,
 * with its tokens and grants revoked. Returns how many agents moved.
 */
export async function reconcileTeamAgents(teamId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const [memberRows, agentRows] = await Promise.all([
    db.select().from(teamMember).where(eq(teamMember.teamId, teamId)),
    db.select({ userId: agent.userId, ownerId: agent.ownerId, handedOverAt: agent.handedOverAt }).from(agent).where(eq(agent.teamId, teamId)),
  ]);
  const memberIds = new Set(memberRows.map((row) => row.userId));
  const moving = agentsToHandOver(agentRows, memberIds).map((item) => item.userId);
  if (moving.length === 0) return 0;
  const people = memberRows.filter((row) => !agentRows.some((item) => item.userId === row.userId));
  const newOwner = pickTransferOwner(people.map((row) => ({ userId: row.userId, role: parseTeamRole(row.role), joinedAt: row.createdAt })));
  // Tokens first: if a later step fails, the former member has already lost the agent's access.
  await revokeAgentTokensQuery(db, moving, now);
  await deleteOAuthGrants(moving);
  await handOverAgentsQuery(db, moving, newOwner, now);
  return moving.length;
}
