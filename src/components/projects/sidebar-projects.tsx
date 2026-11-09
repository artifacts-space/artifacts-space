"use client";

import { IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useRef, useState, type RefObject } from "react";

import { useMediaQuery } from "@/components/app/use-media-query";
import type { SidebarProjectsControls } from "@/components/app/use-sidebar-projects";
import { ProjectsSplitter, projectsPanelId } from "@/components/app/workspace-splitters";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectsRowsHeight } from "@/lib/panel-size-rules";
import { projectNameKey, type ProjectFilter } from "@/lib/projects/rules";
import { deleteProjectCopy, type SidebarProject, type SidebarProjectRow, type SidebarTeam } from "@/lib/projects/sidebar-rules";
import { cn } from "@/lib/utils";

import { InlineNameForm } from "./inline-name-form";
import { NoProjectRow, ProjectEntry } from "./sidebar-project-entry";

interface SidebarProjectsProps {
  controls: SidebarProjectsControls;
  filter: ProjectFilter | null;
  onFilter: (filter: ProjectFilter | null) => void;
  /** The team tab's team, or null on Mine. New projects go to it. */
  scopeTeam: SidebarTeam | null;
  /** On Mine, the shared teams a new project can be for. */
  teams: readonly SidebarTeam[];
  /** True while an artifact card is being dragged. */
  dragging: boolean;
  /** Entries the dragged card may not go into: they live in another space. */
  blockedKeys: ReadonlySet<string>;
  onDropArtifact: (artifactId: string, target: SidebarProject | null) => void;
  /** The artifact list under the group: the resize handle trades height with it. */
  listRef: RefObject<HTMLElement | null>;
}

/** The "Only me" choice. Team slugs never hold an underscore, so it cannot name a team. */
const ONLY_ME = "__me";

/** Who a new project is for, on Mine: the viewer (ONLY_ME) or a shared team's slug. */
function ScopeSelect({ teams, value, onChange }: { teams: readonly SidebarTeam[]; value: string; onChange: (value: string) => void }) {
  if (teams.length === 0) return null;
  const label = (slug: string) => teams.find((team) => team.slug === slug)?.name ?? "Only me";
  return (
    <Select value={value} onValueChange={(next: string | null) => { onChange(next ?? ONLY_ME); }}>
      <SelectTrigger size="sm" aria-label="Who the project is for" className="mt-1 h-7 w-full border-0 bg-transparent px-1.5 text-sm text-muted-foreground shadow-none">
        <SelectValue>{(slug: string) => `For ${label(slug)}`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ONLY_ME}>Only me</SelectItem>
        {teams.map((team) => <SelectItem key={team.slug} value={team.slug}>{team.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CreateForm({ controls, scopeTeam, teams, onDone }: Pick<SidebarProjectsProps, "controls" | "scopeTeam" | "teams"> & { onDone: () => void }) {
  const [forSlug, setForSlug] = useState(ONLY_ME);
  async function submit(name: string) {
    const result = await controls.create(name, scopeTeam?.slug ?? (forSlug === ONLY_ME ? null : forSlug));
    if (!result.success) return result.error;
    onDone();
    return null;
  }
  return (
    <InlineNameForm label="New project name" submitLabel="Create project" onSubmit={submit} onCancel={onDone}>
      {scopeTeam ? <p className="mt-1 px-1.5 text-xs text-muted-foreground">Everyone in {scopeTeam.name} can use it.</p> : <ScopeSelect teams={teams} value={forSlug} onChange={setForSlug} />}
    </InlineNameForm>
  );
}

function isActive(filter: ProjectFilter | null, key: string) {
  return filter !== null && "key" in filter && filter.key === key;
}

type EntriesProps = Pick<SidebarProjectsProps, "controls" | "filter" | "onFilter" | "onDropArtifact" | "blockedKeys"> & { namesTeams: boolean };

/** "No project" and every project entry, with rename in place and delete behind a confirm. */
function ProjectEntries({ controls, filter, onFilter, onDropArtifact, blockedKeys, namesTeams }: EntriesProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ row: SidebarProjectRow; count: number | null } | null>(null);
  const confirmDelete = useConfirm("deleteProject");
  const noneActive = filter !== null && "none" in filter;

  function requestDelete(project: SidebarProject, row: SidebarProjectRow) {
    setDeleting({ row, count: project.rows.length === 1 ? project.count : null });
    confirmDelete.request(() => controls.remove(row));
  }

  function renameForm(project: SidebarProject, row: SidebarProjectRow) {
    const submit = async (name: string) => {
      const result = await controls.rename(row, name);
      if (!result.success) return result.error;
      setRenamingId(null);
      // The list is filtered by the old name: follow the project to its new one.
      if (isActive(filter, project.key) && project.rows.length === 1) onFilter({ key: projectNameKey(result.data.name) });
      return null;
    };
    return <li key={project.key}><InlineNameForm label={`New name for ${row.name}`} initial={row.name} submitLabel="Save name" onSubmit={submit} onCancel={() => { setRenamingId(null); }} /></li>;
  }

  function renderEntry(project: SidebarProject) {
    const renaming = project.rows.find((row) => row.id === renamingId);
    if (renaming) return renameForm(project, renaming);
    const active = isActive(filter, project.key);
    return (
      <ProjectEntry
        key={project.key}
        project={project}
        active={active}
        blocked={blockedKeys.has(project.key)}
        namesTeams={namesTeams}
        onFilter={() => { onFilter(active ? null : { key: project.key }); }}
        onDropArtifact={(id) => { onDropArtifact(id, project); }}
        onRename={(row) => { setRenamingId(row.id); }}
        onDelete={(row) => { requestDelete(project, row); }}
      />
    );
  }

  return (
    <>
      <ul className="space-y-px py-0.5">
        <NoProjectRow count={controls.none} active={noneActive} onFilter={() => { onFilter(noneActive ? null : { none: true }); }} onDropArtifact={(id) => { onDropArtifact(id, null); }} />
        {controls.entries.map(renderEntry)}
      </ul>
      <ConfirmDialog state={confirmDelete.dialog} title="Delete this project?" description={deleting ? deleteProjectCopy(deleting.row, deleting.count) : ""} confirmLabel="Delete project" />
    </>
  );
}

/** The group's heading: open or close it, and start a new project. */
function GroupHeader({ open, dragging, onToggle, onCreate }: { open: boolean; dragging: boolean; onToggle: () => void; onCreate: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <IconChevronRight aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        Projects
        {dragging ? <span className="ml-auto truncate font-normal">Drop on a project</span> : null}
      </button>
      <button
        type="button"
        aria-label="New project"
        title="New project"
        onClick={onCreate}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <IconPlus aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

type RowsProps = Pick<SidebarProjectsProps, "controls" | "filter" | "onFilter" | "scopeTeam" | "teams" | "blockedKeys" | "onDropArtifact" | "listRef"> & {
  creating: boolean;
  onCreated: () => void;
};

/**
 * The group's rows in their own scroll box under the heading, and the handle
 * under them. Once the rows scroll, a divider marks the box's top edge, so a
 * row leaving the view slides below the heading instead of seeming to run
 * under it.
 */
function ProjectRows({ controls, filter, onFilter, scopeTeam, teams, blockedKeys, onDropArtifact, listRef, creating, onCreated }: RowsProps) {
  const [scrolled, setScrolled] = useState(false);
  const rowsRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={rowsRef}
        id={projectsPanelId}
        data-slot="sidebar-projects"
        data-scrolled={scrolled ? "" : undefined}
        onScroll={(event) => { setScrolled(event.currentTarget.scrollTop > 0); }}
        className={cn("relative min-h-0 overflow-y-auto overscroll-contain border-t transition-colors", projectsRowsHeight, scrolled ? "border-border" : "border-transparent")}
      >
        {creating ? <CreateForm controls={controls} scopeTeam={scopeTeam} teams={teams} onDone={onCreated} /> : null}
        <ProjectEntries controls={controls} filter={filter} onFilter={onFilter} onDropArtifact={onDropArtifact} blockedKeys={blockedKeys} namesTeams={scopeTeam === null} />
        {controls.entries.length === 0 && !creating ? <p className="px-2 pb-1 text-xs text-muted-foreground">Create a project, then move artifacts into it.</p> : null}
      </div>
      <ProjectsSplitter rows={rowsRef} list={listRef} />
    </>
  );
}

/**
 * The sidebar's Projects group: every project the viewer may use here, with
 * how many artifacts in this list it holds, plus "No project". Click one to
 * filter the list (the filter select follows), drop an artifact card on one
 * to move it, and create, rename, or delete projects in place. Deleting
 * keeps the artifacts; they just leave the project. Open on wide screens,
 * closed at first where the sidebar is short. While open on wide screens, a
 * handle under the rows trades height with the artifact list.
 */
export function SidebarProjects({ dragging, ...rows }: SidebarProjectsProps) {
  const wide = useMediaQuery("(min-width: 64rem)", true);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const open = dragging || creating || (openChoice ?? wide);

  return (
    <section aria-label="Projects" className={cn("relative flex shrink-0 flex-col border-b px-2 py-1.5", open && "lg:min-h-[104px] lg:shrink")}>
      <GroupHeader open={open} dragging={dragging} onToggle={() => { setOpenChoice(!open); setCreating(false); }} onCreate={() => { setCreating(true); setOpenChoice(true); }} />
      {open ? <ProjectRows {...rows} creating={creating} onCreated={() => { setCreating(false); }} /> : null}
    </section>
  );
}
