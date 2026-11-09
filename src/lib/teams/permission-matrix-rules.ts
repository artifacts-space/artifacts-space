import { can, lockedReason, teamCapabilities, type TeamActor, type TeamCapability } from "./capability-rules";
import { editRoleProblem } from "./role-admin-rules";

/**
 * Pure rules for the Permissions tab: the order of its columns and what
 * each cell lets the viewer do. The server asks role-admin-rules.ts again
 * before it saves anything. Client-safe.
 */

/** A role column: built-in or custom, with what it may do. */
export interface MatrixRole {
  key: string;
  name: string;
  builtIn: boolean;
  capabilities: readonly TeamCapability[];
}

const builtInOrder: Record<string, number> = { owner: 0, admin: 1, member: 3, agent: 4 };

/** Columns from most to least power: Owner, Admin, custom roles by name, Member, Agent. */
export function orderRoles<T extends MatrixRole>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => (builtInOrder[a.key] ?? 2) - (builtInOrder[b.key] ?? 2) || a.name.localeCompare(b.name));
}

/** One cell: whether the role holds it, and why the viewer cannot change it (null when they can). */
export interface MatrixCell {
  held: boolean;
  locked: string | null;
  blocked: string | null;
}

/** The cell for one role and capability, as the viewer sees it. Locked cells explain why; cells the viewer may not change say so. */
export function matrixCell(viewer: TeamActor | null, role: MatrixRole, capability: TeamCapability): MatrixCell {
  const locked = lockedReason(role.key, capability);
  const held = role.key === "owner" || (locked === null && role.capabilities.includes(capability));
  if (locked) return { held, locked, blocked: null };
  const roleProblem = editRoleProblem(viewer, role.key);
  if (roleProblem) return { held, locked: null, blocked: roleProblem };
  if (!can(viewer, capability)) return { held, locked: null, blocked: "You can only grant or take away capabilities you hold." };
  return { held, locked: null, blocked: null };
}

/** The role's capabilities with one cell flipped, in the canonical order. */
export function toggledCapabilities(role: MatrixRole, capability: TeamCapability, on: boolean): TeamCapability[] {
  const next = new Set(role.capabilities);
  if (on) next.add(capability);
  else next.delete(capability);
  return teamCapabilities.filter((item) => next.has(item));
}

/** Capabilities the viewer may put in a new custom role: the ones they hold. Empty when they may not create roles. */
export function grantableCapabilities(viewer: TeamActor | null): TeamCapability[] {
  if (editRoleProblem(viewer, "custom")) return [];
  return teamCapabilities.filter((capability) => can(viewer, capability));
}
