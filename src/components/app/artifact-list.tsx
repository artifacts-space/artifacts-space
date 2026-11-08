"use client";

import { IconCheck, IconDots, IconFolderShare, IconX } from "@tabler/icons-react";

import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { startArtifactDrag } from "@/components/projects/artifact-drag";
import { ProjectLabel } from "@/components/projects/project-label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { projectKeyOf, type MoveTarget, type SidebarProject } from "@/lib/projects/sidebar-rules";
import { rowTags } from "@/lib/tags/rules";
import { cn } from "@/lib/utils";

import type { ArtifactListState } from "./artifact-list-state";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** What a list item says about sharing, or "" for a private artifact with nothing waiting. */
function sharingNote(artifact: ArtifactListItemDto) {
  if (artifact.pendingSharing) return " · Waiting for approval";
  return artifact.visibility === "private" ? "" : ` · ${visibilityLabel(artifact.visibility)}`;
}

/** How a card moves artifacts between projects: drag (fine pointers only) and its menu. */
export interface CardMoves {
  projects: readonly SidebarProject[];
  /** False on touch screens: there the card's menu is the way to move. */
  canDrag: boolean;
  onMove: (artifact: ArtifactListItemDto, target: SidebarProject | null) => void;
  /** The project an artifact would land in for an entry, or why it may not (another space). */
  targetFor: (artifact: ArtifactListItemDto, target: SidebarProject) => MoveTarget;
  onDragChange: (artifactId: string | null) => void;
}

/** One project in the card's menu: pick it, or read why this artifact cannot go there. */
function MoveItem({ artifact, project, current, moves }: { artifact: ArtifactListItemDto; project: SidebarProject; current: boolean; moves: CardMoves }) {
  const target = moves.targetFor(artifact, project);
  const refusal = "refusal" in target ? target.refusal : null;
  return (
    <DropdownMenuItem disabled={current || refusal !== null} onClick={() => { moves.onMove(artifact, project); }} className={refusal ? "flex-col items-start gap-0.5" : undefined}>
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <ProjectLabel name={project.name} icon={project.icon} className="min-w-0 flex-1" />
        {current ? <IconCheck aria-label="Current project" className="ml-auto" /> : null}
      </span>
      {refusal ? <span className="pl-5 text-xs text-muted-foreground">{refusal}</span> : null}
    </DropdownMenuItem>
  );
}

/** The card's menu: move to a project or to no project. The way to move without a mouse. */
function CardMenu({ artifact, moves, titleId }: { artifact: ArtifactListItemDto; moves: CardMoves; titleId: string }) {
  const currentKey = projectKeyOf(artifact.project);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label="Move to project"
        aria-describedby={titleId}
        className="absolute right-1.5 bottom-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 pointer-coarse:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100"
      >
        <IconDots aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-auto min-w-52 max-w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5"><IconFolderShare aria-hidden className="size-3.5" /> Move to project</DropdownMenuLabel>
          {moves.projects.map((project) => <MoveItem key={project.key} artifact={artifact} project={project} current={project.key === currentKey} moves={moves} />)}
          {moves.projects.length === 0 ? <p className="px-1.5 py-1 text-sm text-muted-foreground">Create a project in the sidebar first.</p> : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={currentKey === null} onClick={() => { moves.onMove(artifact, null); }}>
          <IconX aria-hidden /> No project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ListItemProps {
  artifact: ArtifactListItemDto;
  active: boolean;
  onSelect: (id: string) => void;
  moves: CardMoves;
}

function ArtifactListItem({ artifact, active, onSelect, moves }: ListItemProps) {
  const titleId = `artifact-title-${artifact.id}`;
  return (
    <li
      draggable={moves.canDrag}
      onDragStart={(event) => { startArtifactDrag(event, artifact); moves.onDragChange(artifact.id); }}
      onDragEnd={() => { moves.onDragChange(null); }}
      className="group/item relative"
    >
      <button
        type="button"
        onClick={() => { onSelect(artifact.id); }}
        aria-current={active ? "true" : undefined}
        className={cn(
          "w-full rounded-sm px-3 py-2.5 text-left transition-colors",
          active ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-6 w-4 shrink-0 items-center justify-center">
            <ArtifactIcon icon={artifact.icon} kind={artifact.kind} className={artifact.icon ? undefined : "size-3.5"} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 id={titleId} className="truncate text-md font-medium">{artifact.title}</h2>
              <span className="shrink-0 text-xs text-muted-foreground">{dateFormat.format(new Date(artifact.updatedAt))}</span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{artifact.summary || artifact.preview}</p>
            <p className="mt-1 flex min-w-0 items-center pr-6 text-xs text-muted-foreground">
              {artifact.project ? <ProjectLabel name={artifact.project.name} icon={artifact.project.icon} /> : <span className="shrink-0">No project</span>}
              <span className="shrink-0 whitespace-pre">{sharingNote(artifact)}</span>
            </p>
            {artifact.tags.length > 0 ? <RowTags tags={artifact.tags} /> : null}
          </div>
        </div>
      </button>
      <CardMenu artifact={artifact} moves={moves} titleId={titleId} />
    </li>
  );
}

/** A row's tags: the first two and how many more. */
function RowTags({ tags }: { tags: readonly string[] }) {
  const { visible, more } = rowTags(tags);
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      {visible.map((tag) => <span key={tag} className="truncate rounded-sm bg-muted px-1">{tag}</span>)}
      {more > 0 ? <span className="shrink-0">+{more}</span> : null}
    </p>
  );
}

interface ArtifactListProps {
  state: ArtifactListState;
  artifacts: ArtifactListItemDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
  moves: CardMoves;
}

/** The sidebar list. With no artifacts at all it stays quiet, because the main pane already offers to create one. */
export function ArtifactList({ state, artifacts, selectedId, onSelect, onClearFilters, moves }: ArtifactListProps) {
  if (state === "empty") {
    return <p className="px-4 py-10 text-center text-md text-muted-foreground">Nothing here yet.</p>;
  }
  if (state === "no-match") {
    return (
      <div className="px-4 py-10 text-center text-md text-muted-foreground">
        <p>No artifacts match.</p>
        <button type="button" onClick={onClearFilters} className="mt-2 underline underline-offset-4 hover:text-foreground">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5">
      {artifacts.map((artifact) => (
        <ArtifactListItem key={artifact.id} artifact={artifact} active={selectedId === artifact.id} onSelect={onSelect} moves={moves} />
      ))}
    </ul>
  );
}
