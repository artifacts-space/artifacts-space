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
