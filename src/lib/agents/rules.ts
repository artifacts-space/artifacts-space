import { canManageTeam, type TeamRole } from "@/lib/teams/roles";

/** Owners and admins of a shared (not personal) team manage its agents. */
export function canManageAgents(membership: { role: TeamRole; personal: boolean } | null): boolean {
  return membership !== null && !membership.personal && canManageTeam(membership.role);
}

const removalBase = "Its tokens stop working at once and its handle becomes free. What it shared with the team stays with the team; its comments stay in their threads.";

/**
 * The text of the confirm dialog for removing an agent. Removing an agent
 * deletes every artifact it wrote that is not shared through its team
 * (src/lib/agents/service.ts), so the dialog says how many go with it.
 */
export function agentRemovalDescription(deletedArtifacts: number): string {
  if (deletedArtifacts <= 0) return removalBase;
  const count = deletedArtifacts === 1 ? "1 artifact" : `${String(deletedArtifacts)} artifacts`;
  return `${removalBase} It also has ${count} that only it and the person who added it can read. ${deletedArtifacts === 1 ? "It is" : "They are"} deleted with the agent, and this cannot be undone. Share ${deletedArtifacts === 1 ? "it" : "them"} with the team first to keep ${deletedArtifacts === 1 ? "it" : "them"}.`;
}
