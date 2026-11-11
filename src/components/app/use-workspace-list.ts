import { useCallback, useMemo, useState } from "react";

import { filterArtifactList } from "@/components/app/artifact-list-state";
import { useServerSearch } from "@/components/app/use-server-search";
import { useNow } from "@/components/history/use-now";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFilter } from "@/lib/projects/rules";
import { matchesProjectFilter, projectKeyOf } from "@/lib/projects/sidebar-rules";
import { countsArePartial, narrowsTree, sidebarViewCounts, type ScopeTotals } from "@/lib/projects/sidebar-count-rules";
import { groupByProject, matchesView, type WorkspaceView } from "@/lib/projects/sidebar-view-rules";

/** The sidebar's search, format filter, and view: browser state, unlike the project and tag filters in the URL. */
export function useListFilters() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [view, setView] = useState<WorkspaceView>("all");
  const clearFilters = useCallback(() => { setQuery(""); setKind("all"); setView("all"); }, []);
  return { query, setQuery, kind, setKind, view, setView, clearFilters };
}

interface WorkspaceListOptions {
  artifacts: ArtifactListItemDto[];
  filters: Pick<ReturnType<typeof useListFilters>, "query" | "kind" | "view">;
  projectFilter: ProjectFilter | null;
  tagFilter: string[];
  /** The shared team whose list this is, or null for the viewer's own. */
  teamId: string | null;
  viewerId: string;
  /** The project tree's entries, in order. */
  entryKeys: readonly string[];
  /** The server's counts over every artifact in the scope. */
  totals: ScopeTotals;
}

/**
 * What the sidebar shows: the views' counts, the artifacts left after the
 * search, format, and view, and those artifacts under their projects. With
 * no filter on, the counts are the server's over the whole scope; with any
 * filter on, they are the matches (sidebar-count-rules), and `partial` says
 * when those come from a list cut at its newest 100.
 */
export function useWorkspaceList({ artifacts, filters, projectFilter, tagFilter, teamId, viewerId, entryKeys, totals }: WorkspaceListOptions) {
  const { query, kind, view } = filters;
  // The minute, as a number, so the list is filtered again only when Recent's window moves.
  const nowMs = useNow()?.getTime() ?? null;
  const serverMatches = useServerSearch(query, teamId, projectFilter, tagFilter);
  // A card moved out of the filtered project leaves the list at once; Undo brings it back.
  const inFilter = useMemo(() => artifacts.filter((item) => matchesProjectFilter(item.project, projectFilter)), [artifacts, projectFilter]);
  const matching = useMemo(() => filterArtifactList(inFilter, { query, kind }, serverMatches), [inFilter, kind, query, serverMatches]);
  const filtered = useMemo(() => {
    const now = nowMs === null ? null : new Date(nowMs);
    return matching.filter((item) => matchesView(item, view, viewerId, now));
  }, [matching, view, viewerId, nowMs]);
  const groups = useMemo(() => groupByProject(filtered, entryKeys, (item) => projectKeyOf(item.project)), [filtered, entryKeys]);
  const narrowing = { query, kind, view, tags: tagFilter, project: projectFilter !== null };
  const counts = useMemo(() => sidebarViewCounts(totals, { query, kind, view, tags: tagFilter, project: projectFilter !== null }, matching, viewerId), [totals, query, kind, view, tagFilter, projectFilter, matching, viewerId]);
  // A search's matches come from the server, which searches every artifact but also stops at 100.
  const partial = countsArePartial(narrowing, serverMatches?.length ?? inFilter.length);
  return { counts, partial, filtered, groups, narrowed: narrowsTree(narrowing) };
}
