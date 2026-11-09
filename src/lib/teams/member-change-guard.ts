import { APIError } from "better-auth/api";

import { assignRoleProblem, removeMemberProblem } from "./role-admin-rules";
import { getTeamAccessById, listTeamMemberActors, type TeamMemberActor } from "./queries";

/**
 * The full rule for changing or removing a member, for a check that only
 * has the acting user and the request: the same role-admin-rules.ts calls
 * the server actions make (capability, ceiling, self, agents, last owner).
 * Better Auth's own hooks see only the target, so its route hook asks this.
 */

function refuse(message: string): never {
  throw new APIError("FORBIDDEN", { message });
}

function countOwners(members: readonly TeamMemberActor[]) {
  return members.filter((member) => !member.isAgent && member.actor.roleKey === "owner").length;
}

/**
 * Refuses unless `actorId` may change the member `memberId` in `teamId`:
 * to the built-in role `nextRole`, or out of the team when `nextRole` is
 * null. Fails closed: an unknown team, member, or role is refused.
 */
export async function assertMemberChangeAllowed(input: { actorId: string; teamId: string; memberId: string; nextRole: string | null }): Promise<void> {
  const access = await getTeamAccessById(input.actorId, input.teamId);
  if (!access || access.membership.personal) refuse("You do not have permission to do that in this team.");
  const members = await listTeamMemberActors(input.teamId, access.roles);
  const target = members.find((member) => member.memberId === input.memberId);
  if (!target) refuse("Member not found.");
  const targetRole = { roleKey: target.actor.roleKey, capabilities: target.actor.capabilities, isAgent: target.isAgent, isSelf: target.userId === input.actorId };
  if (input.nextRole === null) {
    const problem = removeMemberProblem(access.membership, targetRole, countOwners(members));
    if (problem) refuse(problem);
    return;
  }
  const next = access.roles.get(input.nextRole);
  if (!next?.builtIn) refuse("That role does not exist in this team.");
  const problem = assignRoleProblem(access.membership, targetRole, { key: next.key, capabilities: next.capabilities }, countOwners(members));
  if (problem) refuse(problem);
}
