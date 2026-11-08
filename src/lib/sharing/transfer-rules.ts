import type { ArtifactVisibility } from "@/lib/artifact-types";
import type { TeamRole } from "@/lib/teams/roles";

export interface TransferMember {
  userId: string;
  role: TeamRole;
  joinedAt: Date;
}

export interface TransferArtifact {
  id: string;
  userId: string;
  visibility: ArtifactVisibility;
  teamId: string | null;
  originalAuthorId: string | null;
}

const rolePriority: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Who takes over artifacts a former member shared with the team: the
 * longest-standing owner, else the longest-standing admin. Null when the team
 * has neither, which Better Auth's owner checks should prevent.
 */
export function pickTransferOwner(members: TransferMember[]): string | null {
  let best: TransferMember | null = null;
  for (const member of members) {
    if (member.role === "member") continue;
    if (!best || isBefore(member, best)) best = member;
  }
  return best?.userId ?? null;
}

function isBefore(a: TransferMember, b: TransferMember) {
  const byRole = rolePriority[a.role] - rolePriority[b.role];
  if (byRole !== 0) return byRole < 0;
  return a.joinedAt.getTime() < b.joinedAt.getTime();
}

/**
 * Artifacts shared with `teamId` (any level but private) whose author is no
 * longer a member. Private artifacts always stay with their author.
 */
export function artifactsToTransfer(artifacts: TransferArtifact[], teamId: string, memberIds: ReadonlySet<string>): TransferArtifact[] {
  return artifacts.filter((item) => item.teamId === teamId && item.visibility !== "private" && !memberIds.has(item.userId));
}

/** The new ownership fields. The first author is kept when an artifact moves again. */
export function transferredOwnership(item: TransferArtifact, newOwnerId: string) {
  return { userId: newOwnerId, originalAuthorId: item.originalAuthorId ?? item.userId };
}

/** An agent in the team, as the departure check sees it. */
export interface HandoverAgent {
  userId: string;
  ownerId: string | null;
  handedOverAt: Date | null;
}

/**
 * Agents to hand to a team owner after a departure: those whose owner is no
 * longer a member, and those whose owner's account is gone (owner id null)
 * that were not handed over already. An agent that stays with a former
 * member keeps working for them after they lost the team, so none may stay.
 */
export function agentsToHandOver(agents: readonly HandoverAgent[], memberIds: ReadonlySet<string>): HandoverAgent[] {
  return agents.filter((item) => (item.ownerId === null ? item.handedOverAt === null : !memberIds.has(item.ownerId)));
}
