import { can, isBuiltInRoleKey, lockedReason, roleRank, type TeamActor, type TeamCapability } from "./capability-rules";

/**
 * Pure rules for changing roles: who may edit a role's capabilities, create
 * or delete a custom role, give someone a role, or remove someone. Each
 * returns the reason to show when the change is refused, or null when it is
 * allowed. Escalation is refused everywhere: nobody grants a capability they
 * do not hold, nobody edits a role at or above their own, and only owners
 * make or change owners. The team always keeps one owner.
 */

/** A member being changed, as the rules see them. */
export interface TargetMember {
  roleKey: string;
  isAgent: boolean;
  isSelf: boolean;
}

function isOwner(actor: TeamActor) {
  return actor.kind === "person" && actor.roleKey === "owner";
}

/** Whether the actor may change roles at all: a person holding "change roles". */
function changesRoles(actor: TeamActor | null): actor is TeamActor {
  return actor !== null && actor.kind === "person" && can(actor, "members.roles");
}

/** Why the actor may not edit this role's capabilities, or null. Owner is never editable; others only below the actor. */
export function editRoleProblem(actor: TeamActor | null, roleKey: string): string | null {
  if (!changesRoles(actor)) return "You cannot change roles in this team.";
  if (roleKey === "owner") return "Owners always have every capability.";
  if (roleRank(roleKey) >= roleRank(actor.roleKey)) return "You can only change roles below your own.";
  return null;
}

/** The capabilities that differ between two lists. */
export function changedCapabilities(before: readonly TeamCapability[], after: readonly TeamCapability[]): TeamCapability[] {
  const was = new Set(before);
  const now = new Set(after);
  return [...new Set([...before, ...after])].filter((capability) => was.has(capability) !== now.has(capability));
}

/**
 * Why this change to a role's capabilities is refused, or null. The actor
 * must be allowed to edit the role, every changed capability must be one
 * they hold, and locked cells never change.
 */
export function capabilityChangeProblem(actor: TeamActor | null, roleKey: string, before: readonly TeamCapability[], after: readonly TeamCapability[]): string | null {
  const roleProblem = editRoleProblem(actor, roleKey);
  if (roleProblem) return roleProblem;
  for (const capability of changedCapabilities(before, after)) {
    if (lockedReason(roleKey, capability)) return "That capability is locked for this role.";
    if (!can(actor, capability)) return "You can only grant or take away capabilities you hold.";
  }
  return null;
}

/** Why the actor may not create a custom role with these capabilities, or null. Custom roles rank between Member and Admin. */
export function createRoleProblem(actor: TeamActor | null, capabilities: readonly TeamCapability[]): string | null {
  return capabilityChangeProblem(actor, "custom", [], capabilities);
}

/** Why the actor may not delete this role, or null. Only custom roles below the actor can go. */
export function deleteRoleProblem(actor: TeamActor | null, roleKey: string): string | null {
  if (isBuiltInRoleKey(roleKey)) return "Built-in roles cannot be deleted.";
  return editRoleProblem(actor, roleKey);
}

/** A role being given to someone: its key and what it may do. */
export interface RoleGrant {
  key: string;
  capabilities: readonly TeamCapability[];
}

/**
 * Whether the actor holds everything this role holds, so giving it (or
 * acting on someone who has it) grants nothing they do not hold. Owner roles
 * stay with owners.
 */
function covers(actor: TeamActor, role: RoleGrant) {
  if (isOwner(actor)) return true;
  if (role.key === "owner") return false;
  return role.capabilities.every((capability) => can(actor, capability));
}

/** A member being changed, with what their current role may do. */
export interface TargetWithRole extends TargetMember {
  capabilities: readonly TeamCapability[];
}

/**
 * Why the actor may not give `target` the role `next`, or null. Agents keep
 * the Agent role and people never get it; nobody changes their own role;
 * the actor must hold everything both the old and the new role hold; and
 * the last owner stays an owner.
 *
 * This compares capabilities, not rank, on purpose: as before custom roles,
 * an admin may make someone an admin and may demote another admin, because
 * that grants nothing the admin does not hold. Editing what a role can do is
 * different (editRoleProblem): it changes everyone with the role, so only
 * roles below the actor's rank are editable. Only owners make or demote owners.
 * The same holds for custom roles: one that holds every capability Admin
 * holds may give the Admin role, since that grants nothing it lacks, yet it
 * still cannot change what Admin may do.
 */
export function assignRoleProblem(actor: TeamActor | null, target: TargetWithRole, next: RoleGrant, ownerCount: number): string | null {
  if (!changesRoles(actor)) return "You cannot change roles in this team.";
  if (target.isAgent || next.key === "agent") return "Agents keep the Agent role.";
  if (target.isSelf) return "You cannot change your own role.";
  if (!covers(actor, { key: target.roleKey, capabilities: target.capabilities })) return "You cannot change the role of someone who can do more than you.";
  if (!covers(actor, next)) return "You can only give roles that do no more than yours.";
  if (target.roleKey === "owner" && next.key !== "owner" && ownerCount <= 1) return "A team always keeps at least one owner.";
  return null;
}

/** Why the actor may not remove `target` from the team, or null. People leave on their own; the last owner stays. */
export function removeMemberProblem(actor: TeamActor | null, target: TargetWithRole, ownerCount: number): string | null {
  if (actor?.kind !== "person" || !can(actor, "members.remove")) return "You cannot remove people from this team.";
  if (target.isAgent) return "Remove agents from their own menu.";
  if (target.isSelf) return "Leave the team instead.";
  if (!covers(actor, { key: target.roleKey, capabilities: target.capabilities })) return "You cannot remove someone who can do more than you.";
  if (target.roleKey === "owner" && ownerCount <= 1) return "A team always keeps at least one owner.";
  return null;
}

/**
 * How many people in a team are owners. Agents never count. The database
 * trigger team_keeps_an_owner (drizzle/0035) applies the same rule in SQL;
 * keep the two in step.
 */
export function countOwners(members: readonly { isAgent: boolean; actor: { roleKey: string } }[]): number {
  return members.filter((member) => !member.isAgent && member.actor.roleKey === "owner").length;
}

/** Why the actor may not leave the team, or null. The last owner stays, so the team can always be run. */
export function leaveProblem(actor: TeamActor | null, ownerCount: number): string | null {
  if (actor?.kind === "person" && actor.roleKey === "owner" && ownerCount <= 1) return "Make someone else an owner before you leave. A team always keeps at least one owner.";
  return null;
}

/** Why the actor may not invite someone as `role`, or null. Invitations offer built-in roles that do no more than the inviter's. */
export function inviteProblem(actor: TeamActor | null, role: RoleGrant): string | null {
  if (actor?.kind !== "person" || !can(actor, "members.invite")) return "You cannot invite people to this team.";
  if (!covers(actor, role)) return "You can only invite people to roles that do no more than yours.";
  return null;
}

const keyPattern = /[^a-z0-9]+/g;

/** A custom role's key from its name: lowercase words joined by hyphens. Empty when nothing usable is left. */
export function customRoleKey(name: string): string {
  return name.toLowerCase().replace(keyPattern, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Why a custom role name cannot be used, or null. Built-in names are taken. */
export function customRoleNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the role a name.";
  if (trimmed.length > 40) return "Use 40 characters or fewer for the name.";
  const key = customRoleKey(trimmed);
  if (!key) return "Include at least one letter from A to Z or a number in the name.";
  if (isBuiltInRoleKey(key)) return "That name belongs to a built-in role.";
  return null;
}
