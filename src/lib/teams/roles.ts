/**
 * The built-in roles Better Auth stores on a membership, from most to least
 * power. What each may do is decided in capability-rules.ts, never here.
 */
export const teamRoles = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof teamRoles)[number];

/** Roles a person can invite someone as, or change someone to, from the team page. */
export const assignableRoles = ["admin", "member"] as const satisfies readonly TeamRole[];
export type AssignableRole = (typeof assignableRoles)[number];

const rank: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1 };

function isTeamRole(value: string): value is TeamRole {
  return (teamRoles as readonly string[]).includes(value);
}

/**
 * Reads a stored role. Better Auth allows a comma-separated list; the highest
 * known role wins, and anything unknown counts as a plain member.
 */
export function parseTeamRole(stored: string | null | undefined): TeamRole {
  let best: TeamRole = "member";
  for (const part of (stored ?? "").split(",")) {
    const role = part.trim();
    if (isTeamRole(role) && rank[role] > rank[best]) best = role;
  }
  return best;
}

/** UI label for a role. */
export function roleLabel(role: TeamRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
