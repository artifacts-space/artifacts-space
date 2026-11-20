/**
 * Pure rules for the teammates an agent may @mention, as `teams_list` hands
 * them out: a mention names a handle, and an agent has no page to read its
 * teammates' handles from. Only the members of the caller's own shared teams
 * are listed, as every member reads them on the team page; never an email.
 * team-handles.ts loads the rows.
 */

/** At most this many members are listed per team. Enough for any real team; keeps one huge team from flooding a result. */
export const MAX_TEAM_HANDLES = 200;

/** One member row as loaded: the team, the user, their handle, and whether they are an agent. */
export interface TeamHandleRow {
  teamId: string;
  userId: string;
  handle: string | null;
  name: string;
  isAgent: boolean;
}

/** A teammate as an agent sees them, to @mention by `handle`. */
export interface TeamHandle {
  handle: string;
  name: string;
  kind: "person" | "agent";
}

/** The members listed for one team, and whether some were left out past the cap. */
export interface TeamHandles {
  members: TeamHandle[];
  cut: boolean;
}

/**
 * Groups member rows by team, sorted by handle, without the caller (a
 * mention of yourself notifies no one) and without anyone who has no handle
 * (nobody can mention them). Only the teams in `teamIds` are kept, so a row
 * from another team can never reach the caller.
 */
export function groupTeamHandles(rows: readonly TeamHandleRow[], input: { callerId: string; teamIds: readonly string[]; max?: number }): Map<string, TeamHandles> {
  const max = input.max ?? MAX_TEAM_HANDLES;
  const wanted = new Set(input.teamIds);
  const byTeam = new Map<string, TeamHandle[]>();
  for (const row of rows) {
    if (!wanted.has(row.teamId) || row.userId === input.callerId || !row.handle) continue;
    const list = byTeam.get(row.teamId) ?? [];
    list.push({ handle: row.handle, name: row.name, kind: row.isAgent ? "agent" : "person" });
    byTeam.set(row.teamId, list);
  }
  const grouped = new Map<string, TeamHandles>();
  for (const teamId of input.teamIds) {
    const all = (byTeam.get(teamId) ?? []).sort((a, b) => a.handle.localeCompare(b.handle));
    grouped.set(teamId, { members: all.slice(0, max), cut: all.length > max });
  }
  return grouped;
}
