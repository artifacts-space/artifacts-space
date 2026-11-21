import { effectiveRoleKey } from "./capabilities";
import { parseTeamRole } from "./roles";

/**
 * Pure rules for the teammates an agent sees in `teams_list`: a mention
 * names a handle, and an agent has no page to read its teammates' handles,
 * roles, or join dates from. Only the members of the caller's own shared
 * teams are listed, as every member reads them on the team page; never an
 * email. team-handles.ts loads the rows.
 */

/** At most this many members are listed per team. Enough for any real team; keeps one huge team from flooding a result. */
export const MAX_TEAM_HANDLES = 200;

/** One member row as loaded: the team, the user, their handle, whether they are an agent, and their membership. */
export interface TeamHandleRow {
  teamId: string;
  userId: string;
  handle: string | null;
  name: string;
  isAgent: boolean;
  /** The built-in role Better Auth stores: owner, admin, or member. */
  role?: string | null;
  /** Their custom role in this team, when one is assigned. */
  customKey?: string | null;
  customName?: string | null;
  joinedAt?: Date;
  /** For an agent: the person who added it. */
  ownerName?: string | null;
  /** For an agent: muted in this team. */
  muted?: boolean;
}

/** A teammate as an agent sees them, to @mention by `handle`. */
export interface TeamHandle {
  handle: string;
  name: string;
  kind: "person" | "agent";
  /** The role that applies: owner, admin, member, agent, or a custom role's key (the rule of effectiveRoleKey). */
  roleKey?: string;
  /** A custom role's name, as the team page shows it. Left out for built-in roles. */
  customRoleName?: string;
  joinedAt?: string;
  ownerName?: string | null;
  muted?: boolean;
}

/** The members listed for one team, and whether some were left out past the cap. */
export interface TeamHandles {
  members: TeamHandle[];
  cut: boolean;
}

/** The role that applies to a row (effectiveRoleKey, so the list always shows the role `can` uses), and a custom role's name. */
export function memberRole(row: Pick<TeamHandleRow, "role" | "customKey" | "customName" | "isAgent">): { roleKey: string; customRoleName?: string } {
  const roleKey = effectiveRoleKey({ role: parseTeamRole(row.role ?? null), isAgent: row.isAgent, customKey: row.customKey ?? null });
  const custom = roleKey === row.customKey && row.customName ? { customRoleName: row.customName } : {};
  return { roleKey, ...custom };
}

/** One row as a listed teammate. */
function toTeamHandle(row: TeamHandleRow & { handle: string }): TeamHandle {
  const membership = row.role === undefined ? {} : memberRole(row);
  return {
    handle: row.handle,
    name: row.name,
    kind: row.isAgent ? "agent" : "person",
    ...membership,
    ...(row.joinedAt ? { joinedAt: row.joinedAt.toISOString() } : {}),
    ...(row.isAgent && row.ownerName !== undefined ? { ownerName: row.ownerName } : {}),
    ...(row.isAgent && row.muted !== undefined ? { muted: row.muted } : {}),
  };
}

/**
 * Groups member rows by team, sorted by handle, without the caller (a
 * mention of yourself notifies no one; teams_list gives the caller's own
 * entry apart) and without anyone who has no handle (nobody can mention
 * them). Only the teams in `teamIds` are kept, so a row from another team
 * can never reach the caller.
 */
export function groupTeamHandles(rows: readonly TeamHandleRow[], input: { callerId: string; teamIds: readonly string[]; max?: number }): Map<string, TeamHandles> {
  const max = input.max ?? MAX_TEAM_HANDLES;
  const wanted = new Set(input.teamIds);
  const byTeam = new Map<string, TeamHandle[]>();
  for (const row of rows) {
    const { handle } = row;
    if (!wanted.has(row.teamId) || row.userId === input.callerId || !handle) continue;
    const list = byTeam.get(row.teamId) ?? [];
    list.push(toTeamHandle({ ...row, handle }));
    byTeam.set(row.teamId, list);
  }
  const grouped = new Map<string, TeamHandles>();
  for (const teamId of input.teamIds) {
    const all = (byTeam.get(teamId) ?? []).sort((a, b) => a.handle.localeCompare(b.handle));
    grouped.set(teamId, { members: all.slice(0, max), cut: all.length > max });
  }
  return grouped;
}
