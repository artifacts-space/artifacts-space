"use client";

import type { RefObject } from "react";

import type { ArtifactListState } from "@/components/app/artifact-list-state";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { SidebarToolbar, type SidebarFilters } from "@/components/app/sidebar-toolbar";
import { SidebarViews } from "@/components/app/sidebar-views";
import type { useDashboardProjects } from "@/components/app/use-dashboard-projects";
import { sidebarPanelId } from "@/components/app/workspace-splitters";
import { CollapseSidebarButton, WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { SidebarProjects } from "@/components/projects/sidebar-projects";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFilter } from "@/lib/projects/rules";
import type { TreeGroup, ViewCounts, WorkspaceView } from "@/lib/projects/sidebar-view-rules";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarProps {
  sidebarRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  hidden: boolean;
  onHide: () => void;
  teams: readonly ShareTeam[];
  scopeTeam: ShareTeam | null;
  listPath: string;
  /** The signed-in viewer, for the switcher's avatar. */
  viewerId: string;
  query: string;
  onQuery: (query: string) => void;
  filters: SidebarFilters;
  onCreate: (() => void) | null;
  view: WorkspaceView;
  counts: ViewCounts;
  /** True when the counts come from a list cut at its newest artifacts. */
  partialCounts: boolean;
  onView: (view: WorkspaceView) => void;
  sidebar: ReturnType<typeof useDashboardProjects>;
  projectFilter: ProjectFilter | null;
  groups: readonly TreeGroup<ArtifactListItemDto>[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  listState: ArtifactListState;
  onClearFilters: () => void;
}

/**
 * The workspace sidebar: the workspace switcher, search with the filters
 * and New artifact, the views, and the project tree. Only the views and the
 * tree scroll. From lg up it sits beside the artifact and can be hidden; on
 * smaller screens it stacks above it.
 */
export function WorkspaceSidebar({ sidebarRef, listRef, ...props }: WorkspaceSidebarProps) {
  const { sidebar } = props;
  return (
    <aside
      ref={sidebarRef}
      id={sidebarPanelId}
      aria-label="Workspace"
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col border-b bg-background max-md:max-h-[min(560px,75dvh)] md:max-lg:max-h-[min(420px,40dvh)] lg:border-r lg:border-b-0",
        props.hidden && "lg:hidden",
      )}
    >
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <WorkspaceSwitcher teams={props.teams} scopeTeam={props.scopeTeam} listPath={props.listPath} viewerId={props.viewerId} />
        <CollapseSidebarButton onCollapse={props.onHide} />
      </div>
      <div className="shrink-0 border-b px-3 pt-2 pb-3">
        <SidebarToolbar query={props.query} onQuery={props.onQuery} filters={props.filters} onCreate={props.onCreate} />
      </div>
      <div ref={listRef} data-slot="artifact-list" className="relative min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-2 py-2">
        <SidebarViews view={props.view} counts={props.counts} partial={props.partialCounts} onView={props.onView} />
        <SidebarProjects
          controls={sidebar.projects}
          filter={props.projectFilter}
          onFilter={sidebar.filterBy}
          scopeTeam={props.scopeTeam}
          teams={sidebar.shared}
          dragging={sidebar.dragging}
          blockedKeys={sidebar.blockedKeys}
          onDropArtifact={sidebar.dropped}
          groups={props.groups}
          narrowed={props.narrowed}
          total={props.filters.facets.total}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          moves={sidebar.moves}
          listState={props.listState}
          onClearFilters={props.onClearFilters}
        />
      </div>
    </aside>
  );
}
