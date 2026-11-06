/** Team roles, from most to least power. Better Auth stores them as text. */
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

/** Owners and admins approve sharing, withdraw it, and manage members. */
export function canManageTeam(role: TeamRole) {
  return role === "owner" || role === "admin";
}

/** Only owners change the team's settings, such as its sharing rule. */
export function canEditTeamSettings(role: TeamRole) {
  return role === "owner";
}

/** UI label for a role. */
export function roleLabel(role: TeamRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
