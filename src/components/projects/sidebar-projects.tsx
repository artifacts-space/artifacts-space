"use client";

import { IconFold, IconFoldDown, IconPlus } from "@tabler/icons-react";
import { useId, useState } from "react";

import type { ArtifactListState } from "@/components/app/artifact-list-state";
import { TreeArtifact, type CardMoves } from "@/components/app/tree-artifact";
import type { SidebarProjectsControls } from "@/components/app/use-sidebar-projects";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { projectNameKey, type ProjectFilter } from "@/lib/projects/rules";
import { deleteProjectCopy, projectKeyOf, type SidebarProject, type SidebarProjectRow, type SidebarTeam } from "@/lib/projects/sidebar-rules";
import type { TreeGroup } from "@/lib/projects/sidebar-view-rules";

import { InlineNameForm } from "./inline-name-form";
import { NoProjectRow, ProjectEntry, type Disclosure } from "./sidebar-project-entry";

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
  /** The shown artifacts under their projects, Unfiled last (groupByProject). */
  groups: readonly TreeGroup<ArtifactListItemDto>[];
  /** True while a search or a view narrows the list: only groups with something in them show, all open. */
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  moves: CardMoves;
  /** Whether there is anything at all, or nothing matches. */
  listState: ArtifactListState;
  onClearFilters: () => void;
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

/** The key Unfiled's open state is kept under. Project keys are names, which never start with an underscore pair. */
const UNFILED = "__unfiled";

/**
 * Which groups are closed. Every group starts open; when another artifact
 * is opened (a click, a link, a notification), its group opens again.
 */
function useClosedGroups(selected: { id: string; key: string } | null) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const [shownId, setShownId] = useState(selected?.id ?? null);
  if (shownId !== (selected?.id ?? null)) {
    setShownId(selected?.id ?? null);
    if (selected && closed.has(selected.key)) setClosed(new Set([...closed].filter((key) => key !== selected.key)));
  }
  const toggle = (key: string) => {
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  return { closed, toggle, setClosed };
}

/** The open artifact and the open state key of the group it sits in, or null when none is open in the tree. */
function selectedIn(artifact: ArtifactListItemDto | undefined, known: ReadonlySet<string>): { id: string; key: string } | null {
  if (!artifact) return null;
  const key = projectKeyOf(artifact.project);
  return { id: artifact.id, key: key !== null && known.has(key) ? key : UNFILED };
}

type TreeProps = Pick<SidebarProjectsProps, "controls" | "filter" | "onFilter" | "onDropArtifact" | "blockedKeys" | "groups" | "narrowed" | "selectedId" | "onSelect" | "moves"> & {
  namesTeams: boolean;
  closed: ReadonlySet<string>;
  onToggle: (key: string) => void;
};

/** The artifacts under one group, or nothing while it is closed. */
function GroupItems({ id, items, open, selectedId, onSelect, moves }: { id: string; items: readonly ArtifactListItemDto[]; open: boolean } & Pick<TreeProps, "selectedId" | "onSelect" | "moves">) {
  if (!open || items.length === 0) return null;
  return (
    <ul id={id} className="mt-px mb-1 ml-3 space-y-px border-l pl-2">
      {items.map((artifact) => <TreeArtifact key={artifact.id} artifact={artifact} active={artifact.id === selectedId} onSelect={onSelect} moves={moves} />)}
    </ul>
  );
}

/** Every project with its artifacts, then Unfiled, with rename in place and delete behind a confirm. */
function ProjectTree({ controls, filter, onFilter, onDropArtifact, blockedKeys, namesTeams, groups, narrowed, selectedId, onSelect, moves, closed, onToggle }: TreeProps) {
  const baseId = useId();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ row: SidebarProjectRow; count: number | null } | null>(null);
  const confirmDelete = useConfirm("deleteProject");
  const noneActive = filter !== null && "none" in filter;
  const itemsOf = new Map(groups.map((group) => [group.key ?? UNFILED, group.items]));
  const unfiled = itemsOf.get(UNFILED) ?? [];

  function requestDelete(project: SidebarProject, row: SidebarProjectRow) {
    setDeleting({ row, count: project.rows.length === 1 ? project.count : null });
    confirmDelete.request(() => controls.remove(row));
  }

  // While a search, the format filter, or a view narrows the tree, every group with matches is open and cannot close,
  // so its row has no chevron, and its count is what it shows.
  function disclosure(key: string, items: readonly ArtifactListItemDto[]): Disclosure {
    return { open: narrowed || !closed.has(key), controls: `${baseId}-${key}`, enabled: !narrowed && items.length > 0, onToggle: () => { onToggle(key); } };
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
    return <InlineNameForm label={`New name for ${row.name}`} initial={row.name} submitLabel="Save name" onSubmit={submit} onCancel={() => { setRenamingId(null); }} />;
  }

  function renderEntry(project: SidebarProject) {
    const items = itemsOf.get(project.key) ?? [];
    if (narrowed && items.length === 0) return null;
    const renaming = project.rows.find((row) => row.id === renamingId);
    const active = isActive(filter, project.key);
    const open = disclosure(project.key, items);
    return (
      <div key={project.key} role="group" aria-label={project.name}>
        {renaming ? renameForm(project, renaming) : (
          <ProjectEntry
            project={narrowed ? { ...project, count: items.length } : project}
            active={active}
            blocked={blockedKeys.has(project.key)}
            namesTeams={namesTeams}
            disclosure={open}
            onFilter={() => { onFilter(active ? null : { key: project.key }); }}
            onDropArtifact={(id) => { onDropArtifact(id, project); }}
            onRename={(row) => { setRenamingId(row.id); }}
            onDelete={(row) => { requestDelete(project, row); }}
          />
        )}
        <GroupItems id={open.controls} items={items} open={open.open} selectedId={selectedId} onSelect={onSelect} moves={moves} />
      </div>
    );
  }

  const unfiledOpen = disclosure(UNFILED, unfiled);
  return (
    <>
      {controls.entries.map(renderEntry)}
      {narrowed && unfiled.length === 0 ? null : (
        <div role="group" aria-label="Unfiled">
          <NoProjectRow count={narrowed ? unfiled.length : controls.none} active={noneActive} disclosure={unfiledOpen} onFilter={() => { onFilter(noneActive ? null : { none: true }); }} onDropArtifact={(id) => { onDropArtifact(id, null); }} />
          <GroupItems id={unfiledOpen.controls} items={unfiled} open={unfiledOpen.open} selectedId={selectedId} onSelect={onSelect} moves={moves} />
        </div>
      )}
      <ConfirmDialog state={confirmDelete.dialog} title="Delete this project?" description={deleting ? deleteProjectCopy(deleting.row, deleting.count) : ""} confirmLabel="Delete project" />
    </>
  );
}

const headerButton = "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** The group's heading: close or open every project (not while the tree is narrowed), and start a new one. */
function GroupHeader({ dragging, allClosed, canFold, onFoldAll, onCreate }: { dragging: boolean; allClosed: boolean; canFold: boolean; onFoldAll: () => void; onCreate: () => void }) {
  const foldLabel = allClosed ? "Open every project" : "Close every project";
  return (
    <div className="flex h-8 items-center gap-1 pr-0.5 pl-2">
      <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
        {dragging ? "Drop on a project" : "Projects"}
      </h2>
      {canFold ? (
        <button type="button" aria-label={foldLabel} title={foldLabel} onClick={onFoldAll} className={headerButton}>
          {allClosed ? <IconFoldDown aria-hidden className="size-4" /> : <IconFold aria-hidden className="size-4" />}
        </button>
      ) : null}
      <button type="button" aria-label="New project" title="New project" onClick={onCreate} className={headerButton}>
        <IconPlus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** What the tree says when it has nothing to show: no artifacts yet, or none that match. */
function TreeNotice({ state, onClearFilters }: { state: ArtifactListState; onClearFilters: () => void }) {
  if (state === "items") return null;
  if (state === "empty") return <p className="px-2 py-3 text-sm text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="px-2 py-3 text-sm text-muted-foreground">
      <p>No artifacts match.</p>
      <button type="button" onClick={onClearFilters} className="mt-1 underline underline-offset-4 hover:text-foreground">Clear filters</button>
    </div>
  );
}

/**
 * The sidebar's project tree: every project the viewer may use here, with
 * its count and the artifacts it holds, then Unfiled. Click a project's
 * chevron to show or hide its artifacts, and its name to show only it (the
 * filter follows). Drop an artifact on a project to move it, or use the
 * artifact's menu; create, rename, or delete projects in place. Deleting
 * keeps the artifacts; they just become unfiled.
 */
export function SidebarProjects({ dragging, scopeTeam, teams, listState, onClearFilters, ...tree }: SidebarProjectsProps) {
  const [creating, setCreating] = useState(false);
  const known = new Set(tree.controls.entries.map((entry) => entry.key));
  const selected = tree.selectedId === null ? undefined : tree.groups.flatMap((group) => group.items).find((item) => item.id === tree.selectedId);
  const { closed, toggle, setClosed } = useClosedGroups(selectedIn(selected, known));
  const allKeys = [...known, UNFILED];
  const allClosed = allKeys.every((key) => closed.has(key));

  return (
    <section aria-label="Projects" className="relative">
      <GroupHeader
        dragging={dragging}
        allClosed={allClosed}
        // While the tree is narrowed every group with matches is open, so there is nothing to fold.
        canFold={!tree.narrowed}
        onFoldAll={() => { setClosed(allClosed ? new Set() : new Set(allKeys)); }}
        onCreate={() => { setCreating(true); }}
      />
      {creating ? <CreateForm controls={tree.controls} scopeTeam={scopeTeam} teams={teams} onDone={() => { setCreating(false); }} /> : null}
      <ProjectTree {...tree} namesTeams={scopeTeam === null} closed={closed} onToggle={toggle} />
      {tree.controls.entries.length === 0 && !creating ? <p className="px-2 pt-1 text-xs text-muted-foreground">Create a project, then move artifacts into it.</p> : null}
      <TreeNotice state={listState} onClearFilters={onClearFilters} />
    </section>
  );
}
