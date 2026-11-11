"use client";

import { IconCheck, IconDots, IconFolderShare, IconX } from "@tabler/icons-react";

import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { HarnessMark } from "@/components/harness/harness-byline";
import { SavedAt } from "@/components/history/last-edited";
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
import { cn } from "@/lib/utils";

/** How a row moves artifacts between projects: drag (fine pointers only) and its menu. */
export interface CardMoves {
  projects: readonly SidebarProject[];
  /** False on touch screens: there the row's menu is the way to move. */
  canDrag: boolean;
  onMove: (artifact: ArtifactListItemDto, target: SidebarProject | null) => void;
  /** The project an artifact would land in for an entry, or why it may not (another space). */
  targetFor: (artifact: ArtifactListItemDto, target: SidebarProject) => MoveTarget;
  onDragChange: (artifactId: string | null) => void;
}

/** One project in the row's menu: pick it, or read why this artifact cannot go there. */
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

/** The row's menu: move to a project or out of every project. The way to move without a mouse. */
function MoveMenu({ artifact, moves, titleId }: { artifact: ArtifactListItemDto; moves: CardMoves; titleId: string }) {
  const currentKey = projectKeyOf(artifact.project);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label="Move to project"
        aria-describedby={titleId}
        className="absolute top-1.5 right-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 pointer-coarse:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100"
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
          <IconX aria-hidden /> Unfiled
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Who can read it, as a small badge; nothing for a private artifact with nothing waiting. */
function SharingBadge({ artifact }: { artifact: ArtifactListItemDto }) {
  const text = artifact.pendingSharing ? "Waiting for approval" : artifact.visibility === "private" ? null : visibilityLabel(artifact.visibility);
  if (!text) return null;
  const isPublic = !artifact.pendingSharing && artifact.visibility === "public";
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-xs leading-none", isPublic ? "border-tone-success/40 text-tone-success" : "text-muted-foreground")}>
      {text}
    </span>
  );
}

interface TreeArtifactProps {
  artifact: ArtifactListItemDto;
  active: boolean;
  onSelect: (id: string) => void;
  moves: CardMoves;
}

/**
 * One artifact in the project tree: its format icon, title, when it was
 * last edited, and who can read it. The open one is highlighted with an
 * edge on its left. Drag it onto a project (fine pointers), or move it from
 * its menu.
 */
export function TreeArtifact({ artifact, active, onSelect, moves }: TreeArtifactProps) {
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
          "relative flex w-full items-start gap-2 rounded-lg py-1.5 pr-8 pl-2 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          active ? "bg-muted before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground" : "hover:bg-muted/60",
        )}
      >
        <span className="flex h-5 w-4 shrink-0 items-center justify-center">
          <ArtifactIcon icon={artifact.icon} kind={artifact.kind} className={artifact.icon ? undefined : "size-3.5"} />
        </span>
        <span className="min-w-0 flex-1">
          <h3 id={titleId} className={cn("line-clamp-2 text-sm break-words", active ? "font-medium text-foreground" : "text-foreground/90")}>{artifact.title || "Untitled artifact"}</h3>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <SavedAt at={artifact.updatedAt} />
            <SharingBadge artifact={artifact} />
            <HarnessMark harness={artifact.harness} />
          </span>
        </span>
      </button>
      <MoveMenu artifact={artifact} moves={moves} titleId={titleId} />
    </li>
  );
}
