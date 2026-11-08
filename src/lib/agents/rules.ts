import { canManageTeam, type TeamRole } from "@/lib/teams/roles";

/** Owners and admins of a shared (not personal) team manage its agents. */
export function canManageAgents(membership: { role: TeamRole; personal: boolean } | null): boolean {
  return membership !== null && !membership.personal && canManageTeam(membership.role);
}

const removalBase = "Its tokens stop working at once and its handle becomes free. What it shared with the team stays with the team; its comments stay in their threads.";

/**
 * Who keeps an agent's own artifacts (those not shared through its team) when
 * it is removed: the person who added it, while they are still in its team.
 * Null when nobody can, and the artifacts are deleted with the agent.
 */
export function removalKeeper(input: { ownerId: string | null; ownerInTeam: boolean }): string | null {
  return input.ownerId !== null && input.ownerInTeam ? input.ownerId : null;
}

/**
 * The text of the confirm dialog for removing an agent: where its own
 * artifacts go (to the person who added it), or how many are deleted when
 * nobody can keep them (src/lib/agents/service.ts).
 */
export function agentRemovalDescription(input: { ownArtifacts: number; keeperName: string | null }): string {
  const { ownArtifacts, keeperName } = input;
  if (ownArtifacts <= 0) return removalBase;
  const one = ownArtifacts === 1;
  const count = one ? "1 artifact" : `${String(ownArtifacts)} artifacts`;
  if (keeperName !== null) return `${removalBase} Its ${count} that the team cannot see move to ${keeperName}, who added it, to keep, share, or delete.`;
  return `${removalBase} It also has ${count} that the team cannot see, and the person who added it is no longer in the team. ${one ? "It is" : "They are"} deleted with the agent, and this cannot be undone. Share ${one ? "it" : "them"} with the team first to keep ${one ? "it" : "them"}.`;
}
