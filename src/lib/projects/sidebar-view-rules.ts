/**
 * The workspace sidebar's views and project tree, as pure rules: which
 * artifacts each view shows, the views' counts, how the shown artifacts group
 * under their projects, and the colour a project's dot takes. Which counts
 * the sidebar shows, the server's or the matches, is sidebar-count-rules.
 */

/** The views in the sidebar's nav list. */
export type WorkspaceView = "all" | "recent" | "shared" | "public";

/** "Recent" holds what changed in the last seven days. */
export const recentWindowMs = 7 * 24 * 60 * 60 * 1000;

/** The fields of a list item the views read. */
export interface ViewItem {
  authorId: string;
  actsForAuthor?: boolean;
  visibility: string;
  updatedAt: string;
}

/** True when the viewer neither wrote the artifact nor acts for the agent that did: someone shared it with them. */
export function sharedWithViewer(item: ViewItem, viewerId: string): boolean {
  return item.authorId !== viewerId && item.actsForAuthor !== true;
}

/** True when the artifact changed within `recentWindowMs` of `now`. */
export function isRecent(item: Pick<ViewItem, "updatedAt">, now: Date): boolean {
  return now.getTime() - new Date(item.updatedAt).getTime() <= recentWindowMs;
}

/**
 * True when a view shows the artifact. Recent needs the time, which only the
 * browser knows; until it does (`now` is null), Recent shows everything.
 */
export function matchesView(item: ViewItem, view: WorkspaceView, viewerId: string, now: Date | null): boolean {
  if (view === "shared") return sharedWithViewer(item, viewerId);
  if (view === "public") return item.visibility === "public";
  if (view === "recent") return now === null || isRecent(item, now);
  return true;
}

/** The counts beside the views. Recent has none: its window moves with the clock. */
export interface ViewCounts {
  all: number;
  shared: number;
  public: number;
}

/** Counts every view but Recent over one list. */
export function viewCounts(items: readonly ViewItem[], viewerId: string): ViewCounts {
  let shared = 0;
  let shown = 0;
  for (const item of items) {
    if (sharedWithViewer(item, viewerId)) shared += 1;
    if (item.visibility === "public") shown += 1;
  }
  return { all: items.length, shared, public: shown };
}

/** One group in the project tree: a project's key, or null for Unfiled, with the artifacts shown under it. */
export interface TreeGroup<T> {
  key: string | null;
  items: T[];
}

/**
 * Groups the shown artifacts under the project entries, in the entries'
 * order, then Unfiled last. `keyOf` gives an artifact's project key, or null
 * for none. An artifact whose project has no entry (a project the viewer
 * cannot manage here) is listed under Unfiled, so it is never lost.
 */
export function groupByProject<T>(items: readonly T[], entryKeys: readonly string[], keyOf: (item: T) => string | null): TreeGroup<T>[] {
  const known = new Set(entryKeys);
  const byKey = new Map<string, T[]>(entryKeys.map((key) => [key, []]));
  const unfiled: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    const bucket = key !== null && known.has(key) ? byKey.get(key) : undefined;
    if (bucket) bucket.push(item);
    else unfiled.push(item);
  }
  return [...entryKeys.map((key) => ({ key, items: byKey.get(key) ?? [] })), { key: null, items: unfiled }];
}

/** How many dot colours there are: the `--series-*` tokens. */
export const projectDotCount = 8;

/**
 * Which `--series-*` colour (1 to 8) a project's dot takes. It follows the
 * project's name key, so a project keeps its colour on every visit and in
 * every place it shows.
 */
export function projectDotIndex(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % projectDotCount) + 1;
}

/** The parts of a key press the search shortcut reads. */
export interface ShortcutPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** True when focus is in a field, a text area, a select, or editable content. */
  typing: boolean;
  /** True while a dialog, popover, menu, or list box is open, or the key comes from inside one. */
  inOverlay: boolean;
}

/** True when "/" should move focus to the sidebar search: never while typing, inside an open overlay, or with a modifier held. */
export function focusesSearch(press: ShortcutPress): boolean {
  return press.key === "/" && !press.typing && !press.inOverlay && !press.metaKey && !press.ctrlKey && !press.altKey;
}
