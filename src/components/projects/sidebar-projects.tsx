"use client";

import { IconFold, IconFoldDown, IconPlus } from "@tabler/icons-react";
import { useId, useState } from "react";

import type { ArtifactListState } from "@/components/app/artifact-list-state";
import type { CardMoves } from "@/components/app/tree-artifact";
import type { SidebarProjectsControls } from "@/components/app/use-sidebar-projects";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { projectNameKey, type ProjectFilter } from "@/lib/projects/rules";
import { deleteProjectCopy, projectKeyOf, type SidebarList, type SidebarProject, type SidebarProjectRow, type SidebarTeam } from "@/lib/projects/sidebar-rules";
import { groupCount, looseCount, moreRow, showsLoose, type GroupCount } from "@/lib/projects/sidebar-count-rules";
import type { TreeGroup } from "@/lib/projects/sidebar-view-rules";

import { InlineNameForm } from "./inline-name-form";
import { GroupItems } from "./sidebar-group-items";
import { LooseArtifacts } from "./sidebar-loose-artifacts";
import { ProjectEntry, type Disclosure } from "./sidebar-project-entry";

interface SidebarProjectsProps {
  controls: SidebarProjectsControls;
  filter: ProjectFilter | null;
  onFilter: (filter: ProjectFilter | null) => void;
  /** The team tab's team, or null on Mine. A new project is the team's there, and the viewer's own on Mine. */
  scopeTeam: SidebarTeam | null;
  /** True while an artifact card is being dragged. */
  dragging: boolean;
  /** Entries the dragged card may not go into: they live in another space. */
  blockedKeys: ReadonlySet<string>;
  onDropArtifact: (artifactId: string, target: SidebarProject | null) => void;
  /** The shown artifacts under their projects, then those in no project (groupByProject). */
  groups: readonly TreeGroup<ArtifactListItemDto>[];
  /** True while a search, the format, a view, or tags narrow the list: only groups with matches show, all open, counting their matches. */
  narrowed: boolean;
  /** Every artifact in the scope, from the server: what no project holds is listed after the projects. */
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  moves: CardMoves;
  /** Whether there is anything at all, or nothing matches. */
  listState: ArtifactListState;
  onClearFilters: () => void;
}

/**
 * The form for a new project. It belongs to the list it is made in: the
 * team's on a team tab, the viewer's own on Mine. A team's project is made
 * on the team's tab, since Mine does not list a team's empty projects.
 */
function CreateForm({ controls, scopeTeam, onDone }: Pick<SidebarProjectsProps, "controls" | "scopeTeam"> & { onDone: () => void }) {
  async function submit(name: string) {
    const result = await controls.create(name, scopeTeam?.slug ?? null);
    if (!result.success) return result.error;
    onDone();
    return null;
  }
  return (
    <InlineNameForm label="New project name" submitLabel="Create project" onSubmit={submit} onCancel={onDone}>
      {scopeTeam ? <p className="mt-1 px-1.5 text-xs text-muted-foreground">Everyone in {scopeTeam.name} can use it.</p> : null}
    </InlineNameForm>
  );
}

function isActive(filter: ProjectFilter | null, key: string) {
  return filter !== null && "key" in filter && filter.key === key;
}

/**
 * Which projects are closed. Every project starts open; when another
 * artifact is opened (a click, a link, a notification), its project opens
 * again. The artifacts in no project are never closed.
 */
function useClosedGroups(selected: { id: string; key: string | null } | null) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const selectedId = selected ? selected.id : null;
  const selectedKey = selected ? selected.key : null;
  const [shownId, setShownId] = useState(selectedId);
  if (shownId !== selectedId) {
    setShownId(selectedId);
    if (selectedKey !== null && closed.has(selectedKey)) setClosed(new Set([...closed].filter((item) => item !== selectedKey)));
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

/** The open artifact and the key of the project it sits under in the tree, or a null key when it is in none. */
function selectedIn(artifact: ArtifactListItemDto | undefined, known: ReadonlySet<string>): { id: string; key: string | null } | null {
  if (!artifact) return null;
  const key = projectKeyOf(artifact.project);
  return { id: artifact.id, key: key !== null && known.has(key) ? key : null };
}

type TreeProps = Pick<SidebarProjectsProps, "controls" | "filter" | "onFilter" | "onDropArtifact" | "blockedKeys" | "groups" | "narrowed" | "selectedId" | "onSelect" | "moves"> & {
  /** Which list this is: Mine never renames or deletes a team's project. */
  list: SidebarList;
  closed: ReadonlySet<string>;
  onToggle: (key: string) => void;
};

/** Every project with its artifacts, with rename in place and delete behind a confirm. */
function ProjectTree({ controls, filter, onFilter, onDropArtifact, blockedKeys, list, groups, narrowed, selectedId, onSelect, moves, closed, onToggle }: TreeProps) {
  const baseId = useId();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ row: SidebarProjectRow; count: number | null } | null>(null);
  const confirmDelete = useConfirm("deleteProject");
  const itemsOf = new Map(groups.flatMap((group) => (group.key === null ? [] : [[group.key, group.items] as const])));

  function requestDelete(project: SidebarProject, row: SidebarProjectRow) {
    setDeleting({ row, count: project.rows.length === 1 ? project.count : null });
    confirmDelete.request(() => controls.remove(row));
  }

  // While a search, the format, a view, or tags narrow the tree, every project with matches is open and cannot close,
  // so its row has no chevron, and its count is what it shows.
  function disclosure(key: string, count: GroupCount, more: ReturnType<typeof moreRow>): Disclosure {
    return { open: narrowed || !closed.has(key), controls: `${baseId}-${key}`, enabled: !narrowed && (count.shown > 0 || more !== null), onToggle: () => { onToggle(key); } };
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
    const count = groupCount(narrowed, project.count, items.length);
    const more = moreRow(count, { narrowed, filterOn: filter !== null, active });
    const open = disclosure(project.key, count, more);
    return (
      <div key={project.key} role="group" aria-label={project.name}>
        {renaming ? renameForm(project, renaming) : (
          <ProjectEntry
            project={{ ...project, count: count.count }}
            active={active}
            blocked={blockedKeys.has(project.key)}
            list={list}
            disclosure={open}
            onFilter={() => { onFilter(active ? null : { key: project.key }); }}
            onDropArtifact={(id) => { onDropArtifact(id, project); }}
            onRename={(row) => { setRenamingId(row.id); }}
            onDelete={(row) => { requestDelete(project, row); }}
          />
        )}
        <GroupItems id={open.controls} items={items} open={open.open} more={more} showAllLabel={`Show all ${String(count.count)} in ${project.name}`} onShowAll={() => { onFilter({ key: project.key }); }} selectedId={selectedId} onSelect={onSelect} moves={moves} />
      </div>
    );
  }

  return (
    <>
      {controls.entries.map(renderEntry)}
      <ConfirmDialog state={confirmDelete.dialog} title="Delete this project?" description={deleting ? deleteProjectCopy(deleting.row, deleting.count) : ""} confirmLabel="Delete project" />
    </>
  );
}

/**
 * The artifacts in no project of the tree, after the projects: their rows,
 * and the row saying there are more. Nothing at all when there is nothing
 * to show or do there (showsLoose).
 */
function Loose({ controls, filter, onFilter, onDropArtifact, groups, narrowed, total, dragging, selectedId, onSelect, moves }: Pick<SidebarProjectsProps, "controls" | "filter" | "onFilter" | "onDropArtifact" | "groups" | "narrowed" | "total" | "dragging" | "selectedId" | "onSelect" | "moves">) {
  const items = groups.find((group) => group.key === null)?.items ?? [];
  const filterOn = filter !== null && "none" in filter;
  // Every artifact no entry holds, so the count and the rows agree.
  const count = groupCount(narrowed, looseCount(total, controls.entries.map((entry) => entry.count)), items.length);
  const more = moreRow(count, { narrowed, filterOn: filter !== null, active: filterOn });
  if (!showsLoose({ shown: items.length, more: more !== null, dragging, filterOn })) return null;
  return (
    <LooseArtifacts
      items={items}
      more={more}
      dragging={dragging}
      filterOn={filterOn}
      onShowAll={() => { onFilter({ none: true }); }}
      onClearFilter={() => { onFilter(null); }}
      onDropArtifact={(id) => { onDropArtifact(id, null); }}
      selectedId={selectedId}
      onSelect={onSelect}
      moves={moves}
    />
  );
}

const headerButton = "inline-flex size-7 shrink-0 items-center pointer-coarse:size-11 justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** The group's heading: close or open every project (not while the tree is narrowed), and start a new one. */
function GroupHeader({ dragging, allClosed, canFold, onFoldAll, onCreate }: { dragging: boolean; allClosed: boolean; canFold: boolean; onFoldAll: () => void; onCreate: () => void }) {
  const foldLabel = allClosed ? "Open every project" : "Close every project";
  return (
    <div className="flex h-8 items-center gap-1 pr-0.5 pl-2 pointer-coarse:h-11">
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
 * The sidebar's projects, then the artifacts in no project. The tree holds
 * every project of this list (on Mine, the viewer's own, and a team's only
 * while it holds one of their artifacts), with its count and the artifacts
 * it holds. Click a project's chevron to show or hide its artifacts, and its
 * name to show only it (the filter follows). Drop an artifact on a project
 * to move it, or use the artifact's menu; create, rename, or delete projects
 * in place. Deleting keeps the artifacts; they just have no project then.
 * An artifact does not need a project: those without one are listed plainly
 * after the projects, never as a project of their own.
 */
export function SidebarProjects({ dragging, scopeTeam, listState, onClearFilters, total, ...tree }: SidebarProjectsProps) {
  const [creating, setCreating] = useState(false);
  const known = new Set(tree.controls.entries.map((entry) => entry.key));
  const selected = tree.selectedId === null ? undefined : tree.groups.flatMap((group) => group.items).find((item) => item.id === tree.selectedId);
  const { closed, toggle, setClosed } = useClosedGroups(selectedIn(selected, known));
  const allClosed = known.size > 0 && [...known].every((key) => closed.has(key));

  return (
    <>
      <section aria-label="Projects" className="relative">
        <GroupHeader
          dragging={dragging}
          allClosed={allClosed}
          // While the tree is narrowed every project with matches is open, so there is nothing to fold; nor is there with no project.
          canFold={!tree.narrowed && known.size > 0}
          onFoldAll={() => { setClosed(allClosed ? new Set() : new Set(known)); }}
          onCreate={() => { setCreating(true); }}
        />
        {creating ? <CreateForm controls={tree.controls} scopeTeam={scopeTeam} onDone={() => { setCreating(false); }} /> : null}
        <ProjectTree {...tree} list={scopeTeam === null ? "mine" : "team"} closed={closed} onToggle={toggle} />
        {tree.controls.entries.length === 0 && !creating ? <p className="px-2 pt-1 text-xs text-muted-foreground">Create a project, then move artifacts into it.</p> : null}
      </section>
      <Loose {...tree} total={total} dragging={dragging} />
      <TreeNotice state={listState} onClearFilters={onClearFilters} />
    </>
  );
}
