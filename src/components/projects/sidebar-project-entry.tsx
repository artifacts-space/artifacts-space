"use client";

import { IconDots, IconFolderOff, IconPencil, IconTrash } from "@tabler/icons-react";
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
import { ProjectIcon } from "./project-label";

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

interface DropRowProps {
  label: string;
  icon: React.ReactNode;
  count: number;
  active: boolean;
  onFilter: () => void;
  onDropArtifact: (artifactId: string) => void;
  /** The row's menu, or the inline form that replaces the row. */
  children?: React.ReactNode;
}

/** One row in the Projects group: filters the list when clicked, and takes dropped artifact cards. */
export function DropRow({ label, icon, count, active, onFilter, onDropArtifact, children }: DropRowProps) {
  const { over, handlers } = useDropTarget(onDropArtifact);
  return (
    <li
      {...handlers}
      data-drop-target={over ? "" : undefined}
      className={cn("group/entry relative flex items-center rounded-md transition-colors", over && "bg-accent text-accent-foreground ring-1 ring-foreground/25 ring-inset")}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${label}, ${String(count)} ${count === 1 ? "artifact" : "artifacts"}`}
        onClick={onFilter}
        className={cn(
          "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 pr-5 text-xs text-muted-foreground tabular-nums">{count}</span>
      </button>
      {children}
    </li>
  );
}

/** The "No project" row: shows artifacts without one, and takes cards out of their project. */
export function NoProjectRow(props: Omit<DropRowProps, "label" | "icon" | "children">) {
  return <DropRow {...props} label="No project" icon={<IconFolderOff aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />} />;
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
        className="absolute right-0.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 pointer-coarse:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100"
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
  onFilter: () => void;
  onDropArtifact: (artifactId: string) => void;
}

/** One project in the Projects group: filter, drop target, and its menu. */
export function ProjectEntry({ project, active, onFilter, onDropArtifact, ...menu }: ProjectEntryProps) {
  return (
    <DropRow label={project.name} icon={<ProjectIcon icon={project.icon} />} count={project.count} active={active} onFilter={onFilter} onDropArtifact={onDropArtifact}>
      <EntryMenu project={project} {...menu} />
    </DropRow>
  );
}
