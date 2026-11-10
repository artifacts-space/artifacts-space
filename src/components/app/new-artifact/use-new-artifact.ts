import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter } from "@/lib/projects/rules";

/** One blank page New artifact opened, and the artifact it became once stored. */
export interface NewArtifactSession {
  key: number;
  createdId: string | null;
  /** Changes each time New artifact is pressed while this page shows. */
  focusRequest: number;
}

interface NewArtifactOptions {
  setArtifacts: Dispatch<SetStateAction<ArtifactListItemDto[]>>;
  setSelectedId: (id: string) => void;
  /** Clears the search and format filter, so the new artifact shows in the list. */
  clearFilters: () => void;
}

/** The list with `artifact` in it: replaced where it is, or added first when it is new. */
export function upsertListItem(list: readonly ArtifactListItemDto[], artifact: ArtifactDto): ArtifactListItemDto[] {
  const item = toArtifactListItem(artifact);
  if (!list.some((entry) => entry.id === artifact.id)) return [item, ...list];
  return list.map((entry) => (entry.id === artifact.id ? item : entry));
}

/** The name of the project the list is filtered to, for a new artifact; null for "No project" or no filter. */
export function filteredProjectName(filter: ProjectFilter | null, facets: ProjectFacets): string | null {
  if (!filter || "none" in filter) return null;
  return facets.projects.find((entry) => entry.key === filter.key)?.name ?? null;
}

/**
 * The workspace's New artifact: `start` opens a blank page in the artifact
 * pane, and nothing reaches the list until the page is stored. Picking
 * another artifact, changing scope, or leaving drops an untouched page; one
 * already stored stays in the list. Pressing New artifact again on a page
 * that is still blank keeps it and puts the cursor back in its title, so a
 * double click opens one page.
 */
export function useNewArtifact({ setArtifacts, setSelectedId, clearFilters }: NewArtifactOptions) {
  const [session, setSession] = useState<NewArtifactSession | null>(null);
  /** Artifacts the blank pages became, so they open without a load when picked again. */
  const [stored, setStored] = useState<readonly ArtifactDto[]>([]);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const nextKey = useRef(0);

  const start = useCallback(() => {
    setSession((current) => {
      if (current?.createdId === null) return { ...current, focusRequest: current.focusRequest + 1 };
      nextKey.current += 1;
      return { key: nextKey.current, createdId: null, focusRequest: 0 };
    });
  }, []);

  /** A save from a blank page, possibly after it was left: the list gains or updates it; only the open page selects it. */
  const saved = useCallback((key: number, artifact: ArtifactDto) => {
    setArtifacts((current) => upsertListItem(current, artifact));
    setStored((current) => [...current.filter((entry) => entry.id !== artifact.id), artifact]);
    if (sessionRef.current?.key !== key || sessionRef.current.createdId === artifact.id) return;
    sessionRef.current = { ...sessionRef.current, createdId: artifact.id };
    setSession((current) => (current?.key === key ? { ...current, createdId: artifact.id } : current));
    setSelectedId(artifact.id);
    clearFilters();
  }, [clearFilters, setArtifacts, setSelectedId]);

  /** Opens an artifact from the list. The page's own artifact keeps the page open. */
  const select = useCallback((id: string) => {
    if (sessionRef.current?.createdId === id) return;
    sessionRef.current = null;
    setSession(null);
    setSelectedId(id);
  }, [setSelectedId]);

  /** The page's artifact was deleted. */
  const deleted = useCallback((id: string) => {
    if (sessionRef.current?.createdId === id) setSession(null);
  }, []);

  /** Full artifacts already in hand for the artifact pane: the page's own, plus those the blank pages became. */
  const withStored = useCallback((initial: readonly ArtifactDto[] | undefined) => [...(initial ?? []), ...stored], [stored]);

  return { session, withStored, start, saved, select, deleted };
}
