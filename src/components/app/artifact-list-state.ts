/** What the artifact list shows: the items, a filter mismatch, or nothing because there are no artifacts. */
export type ArtifactListState = "items" | "no-match" | "empty";

interface ArtifactListCounts {
  /** Every artifact in scope, before search and format filters. */
  total: number;
  /** Artifacts left after search and format filters. */
  shown: number;
}

/**
 * Decides the list's state. A filter mismatch is only possible when artifacts exist,
 * so an empty scope never says "No artifacts match" or offers to clear filters.
 */
export function artifactListState({ total, shown }: ArtifactListCounts): ArtifactListState {
  if (total === 0) return "empty";
  return shown === 0 ? "no-match" : "items";
}

/** The fields of a list item the filters read. */
interface FilterableItem {
  id: string;
  kind: string;
  title: string;
  summary: string;
  preview: string;
  project: string;
  source: string;
}

/**
 * The list after the search and format filters. Items match the search in
 * their title, summary, preview, project, or source; `serverMatches` (from a
 * search of full content on the server) adds the rest, after the local ones.
 */
export function filterArtifactList<T extends FilterableItem>(items: readonly T[], filters: { query: string; kind: string }, serverMatches: readonly T[] | null): T[] {
  const search = filters.query.trim().toLowerCase();
  const kindMatches = (item: T) => filters.kind === "all" || item.kind === filters.kind;
  const local = items.filter((item) => {
    if (!kindMatches(item)) return false;
    return !search || [item.title, item.summary, item.preview, item.project, item.source].join(" ").toLowerCase().includes(search);
  });
  if (!search || !serverMatches) return local;
  const shown = new Set(local.map((item) => item.id));
  const known = new Map(items.map((item) => [item.id, item]));
  const extra = serverMatches.filter((item) => !shown.has(item.id) && kindMatches(item)).map((item) => known.get(item.id) ?? item);
  return [...local, ...extra];
}
