"use client";

import { IconChevronRight, IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { scopeLabel, type SidebarProject, type SidebarProjectRow } from "@/lib/projects/sidebar-rules";
import { cn } from "@/lib/utils";

import { carriesArtifact, droppedArtifactId } from "./artifact-drag";
import { ProjectMark } from "./project-label";

/** Drop handling for one sidebar row: highlight while an artifact card is over it, then hand over its id. */
function useDropTarget(onDropArtifact: (artifactId: string) => void) {
  const [over, setOver] = useState(false);
  // Enter and over both accept the drag: browsers repeat dragover only while the pointer moves.
  const accept = (event: React.DragEvent) => {
    if (!carriesArtifact(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  return {
    over,
    handlers: {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (event: React.DragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        setOver(false);
        const id = droppedArtifactId(event);
        if (!id) return;
        event.preventDefault();
        onDropArtifact(id);
      },
    },
  };
}

/** The row's drop state for styling and tests: "" when a drop would land, "blocked" when it is refused. */
function dropState(over: boolean, blocked: boolean) {
  if (!over) return undefined;
  return blocked ? "blocked" : "";
}

/** The disclosure in a group's row: shows or hides the artifacts under it. A spacer when it has none. */
export interface Disclosure {
  open: boolean;
  /** The id of the list it shows or hides. */
  controls: string;
  /** False when nothing is under the group just now. */
  enabled: boolean;
  onToggle: () => void;
}

function DisclosureButton({ label, disclosure }: { label: string; disclosure: Disclosure }) {
  if (!disclosure.enabled) return <span aria-hidden className="size-6 shrink-0" />;
  return (
    <button
      type="button"
      aria-expanded={disclosure.open}
      aria-controls={disclosure.open ? disclosure.controls : undefined}
      aria-label={`${disclosure.open ? "Hide" : "Show"} the artifacts in ${label}`}
      onClick={disclosure.onToggle}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <IconChevronRight aria-hidden className={cn("size-3.5 transition-transform", disclosure.open && "rotate-90")} />
    </button>
  );
}

interface DropRowProps {
  /** True while the dragged card belongs to another space: the drop is refused with a hint. */
  blocked?: boolean;
  label: string;
  icon: React.ReactNode;
  count: number;
  active: boolean;
  disclosure: Disclosure;
  onFilter: () => void;
  onDropArtifact: (artifactId: string) => void;
  /** The row's menu. */
  children?: React.ReactNode;
}

/** The row's look: dimmed when the dragged card may not go in, ringed while it is over the row. */
function dropRowClass(over: boolean, blocked: boolean): string {
  return cn(
    "group/entry relative flex items-center gap-0.5 rounded-lg transition",
    blocked && "opacity-50",
    over && !blocked && "bg-accent text-accent-foreground ring-1 ring-foreground/25 ring-inset",
    over && blocked && "cursor-not-allowed ring-1 ring-foreground/15 ring-inset",
  );
}

/**
 * A group's row in the project tree: the disclosure, then the name, which
 * filters the list to the group when clicked, and its count. It takes
 * dropped artifacts.
 */
export function DropRow({ blocked = false, label, icon, count, active, disclosure, onFilter, onDropArtifact, children }: DropRowProps) {
  const { over, handlers } = useDropTarget(onDropArtifact);
  return (
    <div
      {...handlers}
      data-slot="project-row"
      data-drop-target={dropState(over, blocked)}
      className={dropRowClass(over, blocked)}
    >
      <DisclosureButton label={label} disclosure={disclosure} />
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${label}, ${String(count)} ${count === 1 ? "artifact" : "artifacts"}`}
        title={active ? "Show every project" : `Show only ${label}`}
        onClick={onFilter}
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          active ? "bg-muted font-medium text-foreground" : "text-foreground/90 hover:bg-muted/60 hover:text-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn("shrink-0 text-xs text-muted-foreground tabular-nums", children ? "pr-6" : "pr-1.5")}>{count}</span>
      </button>
      {children}
    </div>
  );
}

/** The Unfiled row: shows artifacts without a project, and takes artifacts out of theirs. */
export function NoProjectRow(props: Omit<DropRowProps, "label" | "icon" | "children">) {
  return <DropRow {...props} label="Unfiled" icon={<ProjectMark name={null} icon={null} />} />;
}

interface EntryMenuProps {
  project: SidebarProject;
  /** True on Mine: team projects then say which team they belong to. */
  namesTeams: boolean;
  onRename: (row: SidebarProjectRow) => void;
  onDelete: (row: SidebarProjectRow) => void;
}

/** Rename and Delete for each row behind an entry. A name shared by several scopes lists each one. */
function EntryMenu({ project, namesTeams, onRename, onDelete }: EntryMenuProps) {
  const labelled = project.rows.length > 1 || (namesTeams && project.rows.some((row) => row.team !== null));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label={`Options for ${project.name}`}
        className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 pointer-coarse:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100"
      >
        <IconDots aria-hidden className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {project.rows.map((row, index) => (
          <DropdownMenuGroup key={row.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {labelled ? <DropdownMenuLabel>{scopeLabel(row.team)}</DropdownMenuLabel> : null}
            <DropdownMenuItem onClick={() => { onRename(row); }}><IconPencil aria-hidden /> Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => { onDelete(row); }}><IconTrash aria-hidden /> Delete</DropdownMenuItem>
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProjectEntryProps extends Omit<EntryMenuProps, "project"> {
  project: SidebarProject;
  active: boolean;
  blocked: boolean;
  disclosure: Disclosure;
  onFilter: () => void;
  onDropArtifact: (artifactId: string) => void;
}

/** One project in the project tree: disclosure, filter, drop target, and its menu. */
export function ProjectEntry({ project, active, blocked, disclosure, onFilter, onDropArtifact, ...menu }: ProjectEntryProps) {
  return (
    <DropRow blocked={blocked} label={project.name} icon={<ProjectMark name={project.name} icon={project.icon} />} count={project.count} active={active} disclosure={disclosure} onFilter={onFilter} onDropArtifact={onDropArtifact}>
      <EntryMenu project={project} {...menu} />
    </DropRow>
  );
}
