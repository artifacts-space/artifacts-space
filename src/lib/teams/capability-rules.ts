/**
 * The one permission rule for teams. Every server path (server actions,
 * route handlers, MCP tools, and Better Auth hooks) asks `can(member,
 * capability)`; the database loader (capabilities.ts) only fills in the
 * member's role and its capabilities. Pure and client-safe, and it fails
 * closed: no member, an unknown capability, or a missing grant means no.
 */

export const teamCapabilities = [
  "share.team",
  "share.link",
  "share.public",
  "approve.sharing",
  "approve.edits",
  "members.invite",
  "members.remove",
  "members.roles",
  "agents.manage",
  "themes.manage",
  "analytics.view",
  "artifacts.withdraw",
  "reports.handle",
  "settings.sharing",
] as const;
export type TeamCapability = (typeof teamCapabilities)[number];

export const builtInRoleKeys = ["owner", "admin", "member", "agent"] as const;
export type BuiltInRoleKey = (typeof builtInRoleKeys)[number];

/** Who acts: a person signed in to the web app, or an agent teammate over MCP. */
export type ActorKind = "person" | "agent";

/** A team member as the rule sees it. `roleKey` is a built-in key or a custom role's key. */
export interface TeamActor {
  roleKey: string;
  kind: ActorKind;
  capabilities: readonly TeamCapability[];
}

/**
 * Capabilities agents never hold, whatever their role says: agents never
 * approve, invite, change roles, or manage the team. Sharing at once would
 * approve their own request, so they always ask first.
 */
export const agentLockedCapabilities: ReadonlySet<TeamCapability> = new Set<TeamCapability>([
  "share.team",
  "share.link",
  "share.public",
  "approve.sharing",
  "approve.edits",
  "members.invite",
  "members.remove",
  "members.roles",
  "agents.manage",
  "themes.manage",
  "artifacts.withdraw",
  "reports.handle",
  "settings.sharing",
]);

const allCapabilities: readonly TeamCapability[] = teamCapabilities;

/**
 * Today's rules as each built-in role's capabilities: the backfill for every
 * existing team and the seed for new ones. Sharing capabilities mean
 * "without asking first"; without one, a member still asks.
 */
export const defaultRoleCapabilities: Record<BuiltInRoleKey, readonly TeamCapability[]> = {
  owner: allCapabilities,
  admin: allCapabilities.filter((capability) => capability !== "settings.sharing"),
  member: ["analytics.view"],
  agent: ["analytics.view"],
};

export const builtInRoleNames: Record<BuiltInRoleKey, string> = { owner: "Owner", admin: "Admin", member: "Member", agent: "Agent" };

/** Narrows a stored string to a known capability. Unknown values are dropped, never granted. */
export function isTeamCapability(value: unknown): value is TeamCapability {
  return typeof value === "string" && (teamCapabilities as readonly string[]).includes(value);
}

/** Narrows a role key to a built-in role. */
export function isBuiltInRoleKey(value: unknown): value is BuiltInRoleKey {
  return typeof value === "string" && (builtInRoleKeys as readonly string[]).includes(value);
}

/**
 * Whether a team member may do something. Agents never hold the locked
 * capabilities; owners (people) hold every capability; everyone else holds
 * exactly what their role grants.
 */
export function can(actor: TeamActor | null | undefined, capability: TeamCapability): boolean {
  if (!actor || !isTeamCapability(capability)) return false;
  if (actor.kind === "agent" || actor.roleKey === "agent") return !agentLockedCapabilities.has(capability) && actor.capabilities.includes(capability);
  if (actor.roleKey === "owner") return true;
  return actor.capabilities.includes(capability);
}

/**
 * Where a role stands. A person may edit only roles below their own and
 * assign only roles below it; owners may also make owners. Custom roles sit
 * between Member and Admin.
 */
export function roleRank(roleKey: string): number {
  if (roleKey === "owner") return 400;
  if (roleKey === "admin") return 300;
  if (roleKey === "member") return 100;
  if (roleKey === "agent") return 50;
  return 200;
}

/** Why a cell of the permissions matrix cannot change, or null when it can. */
export function lockedReason(roleKey: string, capability: TeamCapability): string | null {
  if (roleKey === "owner") return "Owners always have every capability, so a team can always be run.";
  if (roleKey === "agent" && agentLockedCapabilities.has(capability)) return "Agents never approve, share without asking, or manage the team.";
  return null;
}

/**
 * The member as they act right now. A request from an agent's token is an
 * agent whatever the membership says, so it can never borrow a person's role.
 */
export function actingAs(member: TeamActor | null | undefined, actor: ActorKind): TeamActor | null {
  if (!member) return null;
  return actor === "agent" ? { ...member, kind: "agent" } : member;
}

/** A member holding a built-in role with today's default capabilities, before any team changed its roles. */
export function defaultActor(roleKey: BuiltInRoleKey): TeamActor {
  return { roleKey, kind: roleKey === "agent" ? "agent" : "person", capabilities: defaultRoleCapabilities[roleKey] };
}
