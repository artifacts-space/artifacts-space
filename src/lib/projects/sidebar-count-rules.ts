import { viewCounts, type ViewCounts, type ViewItem, type WorkspaceView } from "./sidebar-view-rules";

/**
 * The workspace sidebar's counts, as pure rules. The workspace holds the
 * newest `listLimit` artifacts, and the server counts every artifact in the
 * scope (the facets). With nothing narrowing the list, every count is the
 * server's, so 340 artifacts read 340. While a filter is on (search, format,
 * view, or tags), every count is the matches the sidebar lists instead.
 */

/** How many artifacts a list or a search holds at most: the newest ones (listArtifacts). */
export const listLimit = 100;

/** The server's counts over every artifact in the scope (ProjectFacets). */
export interface ScopeTotals {
  total: number;
  shared: number;
  public: number;
}

/** What narrows the sidebar: the browser's search, format, and view, and the URL's tags and project. */
export interface SidebarNarrowing {
  query: string;
  kind: string;
  view: WorkspaceView;
  tags: readonly string[];
  /** True while the URL's project filter is on (a project, or Unfiled). */
  project: boolean;
}

/**
 * True while the search, the format, a view, or tags narrow the tree: every
 * project with matches is open, and every count is its matches. The project
 * filter alone does not: it is the tree's own choice, and the other projects
 * keep their counts so a click can switch to them.
 */
export function narrowsTree(narrowing: SidebarNarrowing): boolean {
  return narrowing.query.trim() !== "" || narrowing.kind !== "all" || narrowing.view !== "all" || narrowing.tags.length > 0;
}

/**
 * The counts beside the views. With no filter at all, the server's totals
 * (never less than what the list holds, which can include an artifact made
 * since). Otherwise the matches for the search and format, before the view
 * is picked: what each view would list.
 */
export function sidebarViewCounts(totals: ScopeTotals, narrowing: SidebarNarrowing, matching: readonly ViewItem[], viewerId: string): ViewCounts {
  if (narrowsTree(narrowing) || narrowing.project) return viewCounts(matching, viewerId);
  const listed = viewCounts(matching, viewerId);
  return { all: Math.max(totals.total, listed.all), shared: Math.max(totals.shared, listed.shared), public: Math.max(totals.public, listed.public) };
}

/**
 * True when counts read from the list may miss older matches: a filter is
 * on and the list the matches come from was cut at `listLimit`.
 */
export function countsArePartial(narrowing: SidebarNarrowing, loaded: number): boolean {
  return (narrowsTree(narrowing) || narrowing.project) && loaded >= listLimit;
}

/** A group's count beside its name, and how many of those artifacts the tree lists under it. */
export interface GroupCount {
  count: number;
  shown: number;
}

/**
 * One project's (or Unfiled's) count. While the tree is narrowed it is the
 * matches listed; otherwise the server's count, and never less than the rows
 * listed (an artifact made or moved since the page loaded).
 */
export function groupCount(narrowed: boolean, scopeCount: number, shown: number): GroupCount {
  return { count: narrowed ? shown : Math.max(scopeCount, shown), shown };
}

/**
 * Unfiled's count over the whole scope: every artifact no project entry
 * holds, so it counts the artifacts the tree lists under Unfiled, including
 * those whose project has no entry here.
 */
export function unfiledCount(total: number, entryCounts: readonly number[]): number {
  let filed = 0;
  for (const count of entryCounts) filed += count;
  return Math.max(0, total - filed);
}

/** What the row under a group says when it lists fewer artifacts than its count. */
export type MoreRow = { kind: "show-all"; shown: number; count: number } | { kind: "newest"; shown: number; count: number };

/**
 * The row under a group that lists fewer artifacts than its count, or null.
 * With no project filter, "Show all" filters the list to the group, which
 * loads its artifacts. With the group's filter already on, the list holds
 * its newest `listLimit`, and the row says so. Never while the tree is
 * narrowed (the count is the rows) or another group's filter is on.
 */
export function moreRow(group: GroupCount, options: { narrowed: boolean; filterOn: boolean; active: boolean }): MoreRow | null {
  if (options.narrowed || group.shown >= group.count) return null;
  if (options.active) return { kind: "newest", shown: group.shown, count: group.count };
  if (options.filterOn) return null;
  return { kind: "show-all", shown: group.shown, count: group.count };
}
