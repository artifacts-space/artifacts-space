import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ActionResult, ArtifactListItemDto, ArtifactProjectDto } from "@/lib/artifact-types";
import type { ProjectFacets } from "@/lib/projects/queries";
import {
  afterRowCreated,
  afterRowDeleted,
  afterRowRenamed,
  countsFromFacets,
  moveTarget,
  projectKeyOf,
  shiftCount,
  sidebarProjects,
  type HomeSpace,
  type MoveTarget,
  type SidebarProject,
  type SidebarProjectRow,
  type SidebarProjectsState,
  type SidebarTeam,
} from "@/lib/projects/sidebar-rules";
import type { ProjectChoice } from "@/lib/projects/store";

import { settle, type ProjectsApi } from "./projects-api";

type SetArtifacts = (update: (current: ArtifactListItemDto[]) => ArtifactListItemDto[]) => void;

interface SidebarProjectsOptions {
  rows: SidebarProjectRow[];
  facets: ProjectFacets;
  api: ProjectsApi;
  /** The viewer's shared teams, to name a project created for one. */
  teams: readonly SidebarTeam[];
  setArtifacts: SetArtifacts;
  /** Where an artifact's projects live: it only ever moves within that space. */
  homeOf: (artifact: Movable) => HomeSpace;
}

/** The fields of a card that a move reads. */
export type Movable = Pick<ArtifactListItemDto, "id" | "title" | "project" | "authorId" | "visibility" | "teamId">;

/** One artifact's project, replaced only while it still holds the value this change expects. */
function patchProject(setArtifacts: SetArtifacts, id: string, expected: ArtifactProjectDto | null, next: ArtifactProjectDto | null) {
  setArtifacts((current) => current.map((item) => (item.id === id && item.project === expected ? { ...item, project: next } : item)));
}

/** Every artifact in one project row gets a new project value (renamed, or none after a delete). */
function patchRow(setArtifacts: SetArtifacts, rowId: string, next: (project: ArtifactProjectDto) => ArtifactProjectDto | null) {
  setArtifacts((current) => current.map((item) => (item.project?.id === rowId ? { ...item, project: next(item.project) } : item)));
}

function initialState(rows: SidebarProjectRow[], facets: ProjectFacets): SidebarProjectsState {
  return { rows, counts: countsFromFacets(facets) };
}

/** A move to make: the server's choice, what the card shows meanwhile, and what the toast says. */
interface Move {
  choice: ProjectChoice;
  optimistic: ArtifactProjectDto | null;
  message: string;
  undoable: boolean;
}

function moveMessage(title: string, to: ArtifactProjectDto | null, from: ArtifactProjectDto | null) {
  if (to) return `Moved “${title}” to ${to.name}.`;
  return from ? `Took “${title}” out of ${from.name}.` : `“${title}” has no project.`;
}

/**
 * The Projects group's state and changes. Moves are optimistic: the card
 * and counts change at once, roll back when the server refuses, and offer
 * Undo when they land. Fresh server data (after any project change) replaces
 * the local state.
 */
export function useSidebarProjects({ rows, facets, api, teams, setArtifacts, homeOf }: SidebarProjectsOptions) {
  const [source, setSource] = useState({ rows, facets });
  const [state, setState] = useState(() => initialState(rows, facets));
  if (source.rows !== rows || source.facets !== facets) {
    setSource({ rows, facets });
    setState(initialState(rows, facets));
  }
  const entries = useMemo(() => sidebarProjects(state.rows, state.counts), [state]);

  async function apply(artifact: Pick<ArtifactListItemDto, "id" | "title">, from: ArtifactProjectDto | null, move: Move) {
    const shift = (a: ArtifactProjectDto | null, b: ArtifactProjectDto | null) => {
      setState((current) => ({ ...current, counts: shiftCount(current.counts, projectKeyOf(a), projectKeyOf(b)) }));
    };
    patchProject(setArtifacts, artifact.id, from, move.optimistic);
    shift(from, move.optimistic);
    const result = await settle(api.moveArtifact(artifact.id, move.choice), "The project did not change. Try again.");
    if (!result.success) {
      patchProject(setArtifacts, artifact.id, move.optimistic, from);
      shift(move.optimistic, from);
      toast.error(result.error);
      return;
    }
    patchProject(setArtifacts, artifact.id, move.optimistic, result.data);
    if (!move.undoable) {
      toast.success(move.message);
      return;
    }
    const undo = () => void apply(artifact, result.data, { choice: from ? { projectId: from.id } : { none: true }, optimistic: from, message: moveMessage(artifact.title, from, result.data), undoable: false });
    toast.success(move.message, { action: { label: "Undo", onClick: undo } });
  }

  /** The project row an artifact would land in for an entry, or why it may not. */
  function targetFor(artifact: Movable, entry: SidebarProject): MoveTarget {
    return moveTarget(entry, homeOf(artifact));
  }

  /**
   * Moves an artifact into a project entry, or out of every project (null).
   * Only into the entry's project in the artifact's own space: a project in
   * another space is refused with what to do, and nothing moves.
   */
  function move(artifact: Movable, target: SidebarProject | null) {
    const from = artifact.project;
    if (projectKeyOf(from) === (target?.key ?? null)) return;
    if (!target) {
      void apply(artifact, from, { choice: { none: true }, optimistic: null, message: moveMessage(artifact.title, null, from), undoable: true });
      return;
    }
    const resolved = targetFor(artifact, target);
    if ("refusal" in resolved) {
      toast.error(resolved.refusal);
      return;
    }
    const optimistic = { id: resolved.row.id, name: resolved.row.name, icon: resolved.row.icon };
    const choice: ProjectChoice = { projectId: resolved.row.id };
    void apply(artifact, from, { choice, optimistic, message: moveMessage(artifact.title, optimistic, from), undoable: true });
  }

  async function create(name: string, teamSlug: string | null): Promise<ActionResult<SidebarProjectRow>> {
    const result = await settle(api.createProject(teamSlug, name), "The project was not created. Try again.");
    if (!result.success) return result;
    const team = teams.find((item) => item.slug === teamSlug) ?? null;
    const row: SidebarProjectRow = { ...result.data, team };
    setState((current) => afterRowCreated(current, row));
    return { success: true, data: row };
  }

  async function rename(row: SidebarProjectRow, name: string): Promise<ActionResult<SidebarProjectRow>> {
    const result = await settle(api.renameProject(row.id, name), "The project was not renamed. Try again.");
    if (!result.success) return result;
    setState((current) => afterRowRenamed(current, row.id, result.data.name));
    patchRow(setArtifacts, row.id, (project) => ({ ...project, name: result.data.name }));
    return { success: true, data: { ...row, name: result.data.name } };
  }

  async function remove(row: SidebarProjectRow): Promise<boolean> {
    const result = await settle(api.deleteProject(row.id), "The project was not deleted. Try again.");
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    setState((current) => afterRowDeleted(current, row.id));
    patchRow(setArtifacts, row.id, () => null);
    toast.success(`Deleted “${row.name}”. Its artifacts are still here, with no project.`);
    return true;
  }

  return { entries, none: state.counts.none, move, targetFor, create, rename, remove };
}

/** What the Projects group reads and calls. */
export type SidebarProjectsControls = ReturnType<typeof useSidebarProjects>;
