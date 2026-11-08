import { crossSpaceMessage, type MoveSpace } from "./move-rules";
import { projectNameKey, type ProjectFilter } from "./rules";

/**
 * The Projects group in the workspace sidebar, as pure rules. It lists the
 * project rows the viewer may use in the current list (their own and their
 * shared teams' on Mine; the team's on a team tab), merged by name key the
 * same way the project filter merges them, with the list's counts. Moves,
 * renames, and deletes update it optimistically through these functions.
 */

/** A team, as the sidebar names it. */
export interface SidebarTeam {
  slug: string;
  name: string;
}

/** One project row the viewer may manage. */
export interface SidebarProjectRow {
  id: string;
  name: string;
  icon: string | null;
  /** The team whose project this is; null for the viewer's own. */
  team: SidebarTeam | null;
}

/** One entry in the Projects group: every row with the same name key. */
export interface SidebarProject {
  key: string;
  name: string;
  icon: string | null;
  /** Artifacts in the current list that are in this project. */
  count: number;
  rows: SidebarProjectRow[];
}

/** How many artifacts in the list each project key holds, and how many have none. */
export interface ProjectCounts {
  byKey: Readonly<Record<string, number>>;
  none: number;
}

/** The sidebar's state: rows plus counts. Entries are derived with `sidebarProjects`. */
export interface SidebarProjectsState {
  rows: SidebarProjectRow[];
  counts: ProjectCounts;
}

/** A project an artifact points at, by name. */
interface Named {
  name: string;
}

/** The key of an artifact's project, or null for none. */
export function projectKeyOf(project: Named | null): string | null {
  return project ? projectNameKey(project.name) : null;
}

/** Counts from the filter's facets. */
export function countsFromFacets(facets: { projects: readonly { key: string; count: number }[]; none: number }): ProjectCounts {
  return { byKey: Object.fromEntries(facets.projects.map((facet) => [facet.key, facet.count])), none: facets.none };
}

/**
 * The Projects group's entries: rows merged by name key and sorted by name.
 * The viewer's own row names the entry when a team row shares its key, as in
 * the filter. Empty projects stay, so a new one can take its first artifact.
 */
export function sidebarProjects(rows: readonly SidebarProjectRow[], counts: ProjectCounts): SidebarProject[] {
  const byKey = new Map<string, SidebarProject>();
  for (const row of rows) {
    const key = projectNameKey(row.name);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { key, name: row.name, icon: row.icon, count: counts.byKey[key] ?? 0, rows: [row] });
      continue;
    }
    current.rows.push(row);
    if (row.team === null) Object.assign(current, { name: row.name, icon: row.icon });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

function adjust(byKey: Readonly<Record<string, number>>, key: string, delta: number): Record<string, number> {
  return { ...byKey, [key]: Math.max(0, (byKey[key] ?? 0) + delta) };
}

/** Counts after one artifact moved between projects (null is "No project"). */
export function shiftCount(counts: ProjectCounts, from: string | null, to: string | null): ProjectCounts {
  if (from === to) return counts;
  let byKey = counts.byKey;
  let none = counts.none;
  if (from === null) none = Math.max(0, none - 1);
  else byKey = adjust(byKey, from, -1);
  if (to === null) none += 1;
  else byKey = adjust(byKey, to, 1);
  return { byKey, none };
}

function onlyRowWithKey(rows: readonly SidebarProjectRow[], row: SidebarProjectRow): boolean {
  const key = projectNameKey(row.name);
  return rows.every((other) => other.id === row.id || projectNameKey(other.name) !== key);
}

/**
 * The state after a row was deleted. When it was the last row with its name,
 * its artifacts show "No project". When another scope keeps the name, the
 * count stays until the server sends fresh numbers.
 */
export function afterRowDeleted(state: SidebarProjectsState, rowId: string): SidebarProjectsState {
  const row = state.rows.find((item) => item.id === rowId);
  if (!row) return state;
  const rows = state.rows.filter((item) => item.id !== rowId);
  if (!onlyRowWithKey(state.rows, row)) return { rows, counts: state.counts };
  const key = projectNameKey(row.name);
  const { [key]: moved = 0, ...rest } = state.counts.byKey;
  return { rows, counts: { byKey: rest, none: state.counts.none + moved } };
}

/** The state after a row was renamed. Its count follows the new name when no other scope keeps the old one. */
export function afterRowRenamed(state: SidebarProjectsState, rowId: string, name: string): SidebarProjectsState {
  const row = state.rows.find((item) => item.id === rowId);
  if (!row) return state;
  const rows = state.rows.map((item) => (item.id === rowId ? { ...item, name } : item));
  const from = projectNameKey(row.name);
  const to = projectNameKey(name);
  if (from === to || !onlyRowWithKey(state.rows, row)) return { rows, counts: state.counts };
  const { [from]: moved = 0, ...rest } = state.counts.byKey;
  return { rows, counts: { byKey: adjust(rest, to, moved), none: state.counts.none } };
}

/** The state after a project was created. */
export function afterRowCreated(state: SidebarProjectsState, row: SidebarProjectRow): SidebarProjectsState {
  if (state.rows.some((item) => item.id === row.id)) return state;
  return { rows: [...state.rows, row], counts: state.counts };
}

/** True when an artifact's project passes the list's project filter. */
export function matchesProjectFilter(project: Named | null, filter: ProjectFilter | null): boolean {
  if (!filter) return true;
  if ("none" in filter) return project === null;
  return project !== null && projectNameKey(project.name) === filter.key;
}

/** What a scope is called in the sidebar's menus. */
export function scopeLabel(team: SidebarTeam | null): string {
  return team ? team.name : "Yours";
}

/** The copy for deleting one project row. */
export function deleteProjectCopy(row: SidebarProjectRow, count: number | null): string {
  const scope = row.team ? ` from ${row.team.name}` : "";
  if (count === 1) return `“${row.name}” goes away${scope}. Its 1 artifact stays and just leaves the project.`;
  const artifacts = count === null ? "Its artifacts" : `Its ${String(count)} artifacts`;
  return `“${row.name}” goes away${scope}. ${artifacts} stay and just leave the project.`;
}

/** A stored row before it is named for the sidebar. */
interface RowSource {
  id: string;
  name: string;
  icon: string | null;
  teamId: string | null;
}

/** Names each row's team for the sidebar. A row of a team the viewer is not in is left out. */
export function toSidebarRows(sources: readonly RowSource[], teams: readonly (SidebarTeam & { id: string; personal: boolean })[]): SidebarProjectRow[] {
  const shared = new Map(teams.filter((team) => !team.personal).map((team) => [team.id, { slug: team.slug, name: team.name }]));
  return sources.flatMap((source): SidebarProjectRow[] => {
    if (source.teamId === null) return [{ id: source.id, name: source.name, icon: source.icon, team: null }];
    const team = shared.get(source.teamId);
    return team ? [{ id: source.id, name: source.name, icon: source.icon, team }] : [];
  });
}

/** Where an artifact's projects live, as the browser can tell: the viewer's own, a shared team's, or its author's. */
export type HomeSpace = { kind: "own" } | { kind: "team"; slug: string; name: string } | { kind: "other" };

/** The fields of a list item that decide its home space. */
interface HomeSubject {
  authorId: string;
  visibility: string;
  teamId: string | null;
}

/**
 * The artifact's home space, as artifactHomeScope decides it on the server:
 * the shared team it is shared through, else its author's own projects. A
 * team the viewer is not in has no slug here, so none of its rows match.
 */
export function homeSpaceOf(subject: HomeSubject, teams: readonly (SidebarTeam & { id: string; personal: boolean })[], viewerId: string): HomeSpace {
  const team = subject.visibility !== "private" && subject.teamId !== null ? teams.find((item) => item.id === subject.teamId) : undefined;
  if (subject.visibility !== "private" && subject.teamId !== null && !team) return { kind: "team", slug: "", name: "its team" };
  if (team && !team.personal) return { kind: "team", slug: team.slug, name: team.name };
  return subject.authorId === viewerId ? { kind: "own" } : { kind: "other" };
}

function inSpace(row: SidebarProjectRow, home: HomeSpace): boolean {
  if (home.kind === "own") return row.team === null;
  return home.kind === "team" && row.team?.slug === home.slug;
}

function moveSpaceOf(row: SidebarProjectRow): MoveSpace {
  return row.team ? { kind: "team", name: row.team.name } : { kind: "own" };
}

/** A move onto an entry: the row in the artifact's home space, or why it may not go there. */
export type MoveTarget = { row: SidebarProjectRow } | { refusal: string };

/**
 * Which row of an entry an artifact moves into: the one in its home space.
 * When the entry has none, the move is refused with what to do instead;
 * a look-alike project is never made.
 */
export function moveTarget(entry: SidebarProject, home: HomeSpace): MoveTarget {
  const row = entry.rows.find((item) => inSpace(item, home));
  if (row) return { row };
  const other = entry.rows[0];
  const target: MoveSpace = other ? moveSpaceOf(other) : { kind: "own" };
  const from: MoveSpace = home.kind === "team" ? { kind: "team", name: home.name } : home;
  return { refusal: crossSpaceMessage(entry.name, target, from) };
}
