import { useCallback, useMemo, useState } from "react";

import { filterArtifactList } from "@/components/app/artifact-list-state";
import { useServerSearch } from "@/components/app/use-server-search";
import { useNow } from "@/components/history/use-now";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFilter } from "@/lib/projects/rules";
import { matchesProjectFilter, projectKeyOf } from "@/lib/projects/sidebar-rules";
import { groupByProject, matchesView, viewCounts, type WorkspaceView } from "@/lib/projects/sidebar-view-rules";

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
}

/**
 * What the sidebar shows: the views' counts, the artifacts left after the
 * search, format, and view, and those artifacts under their projects.
 */
export function useWorkspaceList({ artifacts, filters, projectFilter, tagFilter, teamId, viewerId, entryKeys }: WorkspaceListOptions) {
  const { query, kind, view } = filters;
  // The minute, as a number, so the list is filtered again only when Recent's window moves.
  const nowMs = useNow()?.getTime() ?? null;
  const serverMatches = useServerSearch(query, teamId, projectFilter, tagFilter);
  // A card moved out of the filtered project leaves the list at once; Undo brings it back.
  const inFilter = useMemo(() => artifacts.filter((item) => matchesProjectFilter(item.project, projectFilter)), [artifacts, projectFilter]);
  const counts = useMemo(() => viewCounts(inFilter, viewerId), [inFilter, viewerId]);
  const filtered = useMemo(() => {
    const now = nowMs === null ? null : new Date(nowMs);
    return filterArtifactList(inFilter, { query, kind }, serverMatches).filter((item) => matchesView(item, view, viewerId, now));
  }, [inFilter, kind, query, serverMatches, view, viewerId, nowMs]);
  const groups = useMemo(() => groupByProject(filtered, entryKeys, (item) => projectKeyOf(item.project)), [filtered, entryKeys]);
  const narrowed = query.trim() !== "" || kind !== "all" || view !== "all";
  return { counts, filtered, groups, narrowed };
}
