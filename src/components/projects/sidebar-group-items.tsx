"use client";

import { TreeArtifact, type CardMoves } from "@/components/app/tree-artifact";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { MoreRow as More } from "@/lib/projects/sidebar-count-rules";

/** What the artifacts under a project, and those in no project, share: which is open, and how a card moves. */
export interface ArtifactRowsProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  moves: CardMoves;
}

interface MoreRowProps {
  /** The row under the artifacts when the sidebar lists fewer than there are, or null. */
  more: More | null;
  /** The accessible name of Show all: it says what it shows all of. */
  showAllLabel: string;
  onShowAll: () => void;
}

/** What the row under a list says when it holds fewer artifacts than there are, and its Show all button. */
export function MoreRow({ more, showAllLabel, onShowAll }: MoreRowProps) {
  if (!more) return null;
  if (more.kind === "newest") return <p className="py-1 pl-2 text-xs text-muted-foreground">Showing the newest {more.shown} of {more.count}. Search to find older ones.</p>;
  return (
    <p className="flex items-center gap-2 py-0.5 pl-2 text-xs text-muted-foreground">
      <span>Showing {more.shown} of {more.count}</span>
      <button type="button" aria-label={showAllLabel} onClick={onShowAll} className="rounded-md px-1.5 py-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11">
        Show all
      </button>
    </p>
  );
}

/** Artifact rows, newest first as the list gives them. */
export function ArtifactRows({ items, selectedId, onSelect, moves }: ArtifactRowsProps & { items: readonly ArtifactListItemDto[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-px">
      {items.map((artifact) => <TreeArtifact key={artifact.id} artifact={artifact} active={artifact.id === selectedId} onSelect={onSelect} moves={moves} />)}
    </ul>
  );
}

interface GroupItemsProps extends ArtifactRowsProps, MoreRowProps {
  id: string;
  items: readonly ArtifactListItemDto[];
  open: boolean;
}

/** The artifacts under one project, then the Show all row when it holds more; nothing while it is closed. */
export function GroupItems({ id, items, open, more, showAllLabel, onShowAll, ...rows }: GroupItemsProps) {
  if (!open || (items.length === 0 && !more)) return null;
  return (
    <div id={id} className="mt-px mb-1 ml-3 border-l pl-2">
      <ArtifactRows items={items} {...rows} />
      <MoreRow more={more} showAllLabel={showAllLabel} onShowAll={onShowAll} />
    </div>
  );
}
