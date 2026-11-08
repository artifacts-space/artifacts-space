import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { workspaceQuery } from "@/lib/projects/filter-params";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter } from "@/lib/projects/rules";
import type { SidebarProject, SidebarProjectRow } from "@/lib/projects/sidebar-rules";

import type { CardMoves } from "./artifact-list";
import type { ProjectsApi } from "./projects-api";
import type { ShareTeam } from "./share-teams-context";
import { useMediaQuery } from "./use-media-query";
import { useSidebarProjects } from "./use-sidebar-projects";

interface DashboardProjectsOptions {
  artifacts: ArtifactListItemDto[];
  setArtifacts: (update: (current: ArtifactListItemDto[]) => ArtifactListItemDto[]) => void;
  rows: SidebarProjectRow[];
  facets: ProjectFacets;
  api: ProjectsApi;
  teams: readonly ShareTeam[];
  scopeTeam: ShareTeam | null;
  tagFilter: readonly string[];
  listPath: string;
}

/**
 * Wires the sidebar's Projects group to the list: filtering through the URL
 * (the filter select follows), dragging cards (fine pointers only, never on
 * touch screens), and moving cards from their menu.
 */
export function useDashboardProjects({ artifacts, setArtifacts, rows, facets, api, teams, scopeTeam, tagFilter, listPath }: DashboardProjectsOptions) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const canDrag = useMediaQuery("(pointer: fine)");
  const shared = useMemo(() => teams.filter((team) => !team.personal).map(({ slug, name }) => ({ slug, name })), [teams]);
  const projects = useSidebarProjects({ rows, facets, api, teams: shared, setArtifacts });

  function filterBy(next: ProjectFilter | null) {
    startTransition(() => { router.push(`${listPath}${workspaceQuery(scopeTeam?.slug ?? null, next, tagFilter)}`); });
  }

  function dropped(artifactId: string, target: SidebarProject | null) {
    setDragging(false);
    const artifact = artifacts.find((item) => item.id === artifactId);
    if (artifact) projects.move(artifact, target);
  }

  const moves: CardMoves = {
    projects: projects.entries,
    canDrag,
    onMove: projects.move,
    onDragChange: (id) => { setDragging(id !== null); },
  };

  return { projects, moves, dragging, shared, filterBy, dropped };
}
