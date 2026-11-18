import { and, eq, ne, notInArray, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, sharingRequest, teamMember } from "@/db/schema";
import { parseTeamRole } from "@/lib/teams/roles";

import { artifactsToTransfer, pickTransferOwner, transferredOwnership, type TransferMember } from "./transfer-rules";

/**
 * The artifacts whose home is `teamId` (shared through it at any level but
 * private): what a departure hands over. The leave preview lists the
 * departing person's rows by the same condition, so it names exactly what
 * reconcileTeamArtifacts will move.
 */
export function homeInTeamCondition(teamId: string): SQL {
  const condition = and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private"));
  if (!condition) throw new Error("The team home condition could not be built.");
  return condition;
}

/** Everyone in the team (people and agents) as pickTransferOwner reads them. */
export async function loadTransferMembers(teamId: string): Promise<TransferMember[]> {
  const rows = await getDb().select().from(teamMember).where(eq(teamMember.teamId, teamId));
  return rows.map((row) => ({ userId: row.userId, role: parseTeamRole(row.role), joinedAt: row.createdAt }));
}

/**
 * Restores the rule "artifacts shared through a team belong to a member":
 * artifacts a former member shared with the team move to its longest-standing
 * owner, keeping the original author, and that person's open requests for the
 * team are canceled. Their private artifacts stay theirs. Idempotent; runs
 * after a member leaves or is removed.
 */
export async function reconcileTeamArtifacts(teamId: string): Promise<number> {
  const db = getDb();
  const members = await loadTransferMembers(teamId);
  const memberIds = new Set(members.map((member) => member.userId));
  if (memberIds.size === 0) return 0;

  await db
    .update(sharingRequest)
    .set({ status: "canceled", decidedAt: new Date() })
    .where(and(eq(sharingRequest.teamId, teamId), eq(sharingRequest.status, "pending"), notInArray(sharingRequest.requestedBy, [...memberIds])));

  const candidates = await db
    .select({ id: artifact.id, userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId, originalAuthorId: artifact.originalAuthorId })
    .from(artifact)
    .where(and(homeInTeamCondition(teamId), notInArray(artifact.userId, [...memberIds])));
  const moving = artifactsToTransfer(candidates, teamId, memberIds);
  const newOwner = pickTransferOwner(members);
  if (moving.length === 0 || !newOwner) return 0;

  // Each update only applies if the artifact still has the former author, so a rerun is harmless.
  await Promise.all(
    moving.map((item) =>
      db.update(artifact).set(transferredOwnership(item, newOwner)).where(and(eq(artifact.id, item.id), eq(artifact.userId, item.userId))),
    ),
  );
  return moving.length;
}
