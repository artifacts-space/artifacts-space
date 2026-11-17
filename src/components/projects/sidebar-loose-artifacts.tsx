"use client";

import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { MoreRow as More } from "@/lib/projects/sidebar-count-rules";
import { cn } from "@/lib/utils";

import { ArtifactRows, MoreRow, type ArtifactRowsProps } from "./sidebar-group-items";
import { useDropTarget } from "./use-drop-target";

/** The section's accessible name. Its heading says "Artifacts": plain rows after the projects, not a project of their own. */
export const looseArtifactsLabel = "Artifacts without a project";

interface LooseArtifactsProps extends ArtifactRowsProps {
  /** The shown artifacts in no project, newest first. */
  items: readonly ArtifactListItemDto[];
  /** The row under them when the sidebar lists fewer than there are. */
  more: More | null;
  /** True while a card is dragged: the section then takes a drop, even when it lists nothing. */
  dragging: boolean;
  /** True while the list is filtered to the artifacts without a project: the heading then offers the way back to every project. Other filters (search, format, view, tags) stay as they are. */
  filterOn: boolean;
  onShowAll: () => void;
  onClearFilter: () => void;
  onDropArtifact: (artifactId: string) => void;
}

/** The section's look: ringed while a dragged card is over it, as a project's row is. */
function sectionClass(over: boolean): string {
  return cn("rounded-lg transition", over && "bg-accent text-accent-foreground ring-1 ring-foreground/25 ring-inset");
}

/**
 * The artifacts in no project, listed plainly after the projects, newest
 * first. An artifact does not need a project, so this is not a project's
 * row: no dot, no count, nothing to open or close. Drop a card anywhere on
 * it to take the card out of its project; the card's menu does the same
 * without a mouse. The caller leaves it out when there is nothing to show
 * (showsLoose).
 */
export function LooseArtifacts({ items, more, dragging, filterOn, onShowAll, onClearFilter, onDropArtifact, ...rows }: LooseArtifactsProps) {
  const { over, handlers } = useDropTarget(onDropArtifact);
  return (
    <section {...handlers} aria-label={looseArtifactsLabel} data-slot="loose-artifacts" data-drop-target={over ? "" : undefined} className={sectionClass(over)}>
      <div className="flex h-8 items-center gap-1 pr-0.5 pl-2 pointer-coarse:h-11">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {dragging ? "Drop here to take it out of its project" : "Artifacts"}
        </h2>
        {filterOn ? (
          <button type="button" onClick={onClearFilter} className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11">
            Show every project
          </button>
        ) : null}
      </div>
      <ArtifactRows items={items} {...rows} />
      <MoreRow more={more} showAllLabel={more ? `Show all ${String(more.count)} artifacts without a project` : ""} onShowAll={onShowAll} />
    </section>
  );
}
