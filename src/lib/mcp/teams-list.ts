import { loadActor } from "@/lib/agents/queries";
import { isBuiltInRoleKey } from "@/lib/teams/capability-rules";
import type { TeamHandle } from "@/lib/teams/handle-rules";
import type { TeamMembership } from "@/lib/teams/queries";
import { teamHandles } from "@/lib/teams/team-handles";

import { actorFacts, toMcpActor } from "./actors";

/**
 * teams_list: who the caller is, their teams with the role and capabilities
 * they hold in each, and each shared team's members with their handle (to
 * @mention), role, and join date, as every member reads them on the team
 * page. Never an email, and never a team the caller is not in.
 */

/** A name or other text its owner typed, labelled untrusted as comment bodies are. */
function untrusted(text: string) {
  return { untrustedText: text };
}

/** A listed teammate. A handle is letters, digits, and hyphens; names are untrusted. Fields that are unset or false are left out. */
function toMcpMember(member: TeamHandle) {
  return {
    handle: member.handle,
    kind: member.kind,
    name: untrusted(member.name),
    ...(member.roleKey ? { roleKey: member.roleKey } : {}),
    ...(member.customRoleName ? { customRoleName: untrusted(member.customRoleName) } : {}),
    ...(member.joinedAt ? { joinedAt: member.joinedAt } : {}),
    ...(member.ownerName ? { for: untrusted(member.ownerName) } : {}),
    ...(member.muted === true ? { muted: true as const } : {}),
  };
}

/** The caller's own entry: what teammates see of them. Null when the caller is no longer an actor (an agent without its team). */
async function callerEntry(userId: string) {
  const actor = await loadActor(userId);
  if (!actor) return null;
  const muted = actor.kind === "agent" && actor.teamMuted ? { muted: true as const } : {};
  return { ...toMcpActor(actorFacts(actor), true), ...muted };
}

/** One team as the caller holds it: its role and what that role lets the caller do there. */
function teamEntry(team: TeamMembership) {
  // A custom role's name is text an owner or admin typed, so it is labelled untrusted; a built-in role's name is ours.
  const roleName = isBuiltInRoleKey(team.roleKey) ? { roleName: team.roleName } : { customRoleName: untrusted(team.roleName) };
  return {
    slug: team.slug,
    name: team.name,
    role: team.role,
    roleKey: team.roleKey,
    ...roleName,
    capabilities: team.capabilities,
    personal: team.personal,
    teamSharingNeedsApproval: team.teamSharingNeedsApproval,
  };
}

/**
 * The caller's teams as teams_list returns them, with the caller's own
 * entry. Each shared team lists its members to @mention, without the
 * caller; a personal team is only you, so it lists none. `membersCut` says
 * the list stopped at the cap.
 */
export async function teamsListResult(userId: string, teams: readonly TeamMembership[]) {
  const shared = teams.filter((team) => !team.personal).map((team) => team.id);
  const [you, handles] = await Promise.all([callerEntry(userId), teamHandles(userId, shared)]);
  return {
    you,
    teams: teams.map((team) => {
      const base = teamEntry(team);
      const listed = handles.get(team.id);
      if (!listed) return base;
      return { ...base, members: listed.members.map(toMcpMember), ...(listed.cut ? { membersCut: true } : {}) };
    }),
  };
}
