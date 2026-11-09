/**
 * Team limits. Client-safe, so marketing and docs pages can quote them.
 * Better Auth enforces the member cap when someone accepts an invitation:
 * it counts every member row, so agent teammates count toward it too.
 */
export const teamLimits = {
  /** Members (people and agents) a team can hold before invitations stop being accepted. Better Auth's default, made explicit. */
  maxMembers: 100,
  /** Custom roles a team can hold. Every permission check loads all of a team's roles, so this keeps that read small. */
  maxCustomRoles: 20,
} as const;
