import type { ProjectsApi } from "@/components/app/projects-api";
import type { ArtifactDto, ArtifactProjectDto } from "@/lib/artifact-types";
import type { ProjectFacets } from "@/lib/projects/queries";
import { crossSpaceMessage } from "@/lib/projects/move-rules";
import { mergeProjectFacets, normalizeProjectName, projectNameKey } from "@/lib/projects/rules";
import type { SidebarProjectRow } from "@/lib/projects/sidebar-rules";

/**
 * Development only: projects for the /dev/workspace fixture, kept in
 * memory, with a stand-in for the project server actions. Every fixture
 * artifact is private, so like the server it refuses team projects.
 * "Locked note" refuses every move, so tests can see a move roll back.
 */

/** The fixture's projects and which project each artifact is in. */
export interface FixtureProjectsState {
  rows: SidebarProjectRow[];
  links: Readonly<Record<string, string | null>>;
}

export const LOCKED_TITLE = "Locked note";

const acme = { slug: "acme", name: "Acme" };

/** Two of the viewer's projects, one team project, and three artifacts filed in them. */
export function initialFixtureProjects(): FixtureProjectsState {
  return {
    rows: [
      { id: "project-design", name: "Design", icon: null, team: null },
      { id: "project-research", name: "Research", icon: "🔬", team: null },
      { id: "project-launch", name: "Launch", icon: null, team: acme },
    ],
    links: { "fixture-ui": "project-design", "fixture-markdown": "project-design", "fixture-csv": "project-research" },
  };
}

function toDto(row: SidebarProjectRow): ArtifactProjectDto {
  return { id: row.id, name: row.name, icon: row.icon };
}

/** The artifacts with their projects filled in. */
export function withProjects(artifacts: readonly ArtifactDto[], state: FixtureProjectsState): ArtifactDto[] {
  const byId = new Map(state.rows.map((row) => [row.id, row]));
  return artifacts.map((artifact) => {
    const row = byId.get(state.links[artifact.id] ?? "");
    return { ...artifact, project: row ? toDto(row) : null };
  });
}

/** The project filter's facets for the fixture's artifacts. */
export function fixtureFacets(artifacts: readonly ArtifactDto[]): ProjectFacets {
  const counts = new Map<string, { project: ArtifactProjectDto; count: number }>();
  for (const artifact of artifacts) {
    if (!artifact.project) continue;
    const current = counts.get(artifact.project.id);
    counts.set(artifact.project.id, { project: artifact.project, count: (current?.count ?? 0) + 1 });
  }
  const projects = mergeProjectFacets([...counts.values()].map(({ project, count }) => ({ ...project, nameKey: projectNameKey(project.name), own: true, count })));
  return { projects, none: artifacts.filter((artifact) => !artifact.project).length, total: artifacts.length };
}

type Update = (change: (current: FixtureProjectsState) => FixtureProjectsState) => void;
type Read = () => FixtureProjectsState;

function fail(error: string) {
  return Promise.resolve({ success: false as const, error });
}

/** An in-memory ProjectsApi over the fixture's state. */
export function fixtureProjectsApi(read: Read, update: Update, titleOf: (artifactId: string) => string): ProjectsApi {
  return {
    moveArtifact: (artifactId, choice) => {
      if (titleOf(artifactId) === LOCKED_TITLE) return fail("Artifact not found, or you cannot edit it.");
      const state = read();
      const row = "name" in choice ? state.rows.find((item) => projectNameKey(item.name) === projectNameKey(choice.name)) : "projectId" in choice ? state.rows.find((item) => item.id === choice.projectId) : undefined;
      if (!("none" in choice) && !row) return fail("Project not found.");
      if (row?.team) return fail(crossSpaceMessage(row.name, { kind: "team", name: row.team.name }, { kind: "own" }));
      update((current) => ({ ...current, links: { ...current.links, [artifactId]: row?.id ?? null } }));
      return Promise.resolve({ success: true, data: row ? toDto(row) : null });
    },
    createProject: (teamSlug, name) => {
      const clean = normalizeProjectName(name);
      if (read().rows.some((item) => projectNameKey(item.name) === projectNameKey(clean))) return fail("A project with that name already exists.");
      const row: SidebarProjectRow = { id: `project-${projectNameKey(clean).replaceAll(" ", "-")}`, name: clean, icon: null, team: teamSlug ? acme : null };
      update((current) => ({ ...current, rows: [...current.rows, row] }));
      return Promise.resolve({ success: true, data: toDto(row) });
    },
    renameProject: (projectId, name) => {
      const clean = normalizeProjectName(name);
      update((current) => ({ ...current, rows: current.rows.map((row) => (row.id === projectId ? { ...row, name: clean } : row)) }));
      const row = read().rows.find((item) => item.id === projectId);
      return row ? Promise.resolve({ success: true, data: toDto({ ...row, name: clean }) }) : fail("Project not found.");
    },
    deleteProject: (projectId) => {
      update((current) => ({
        rows: current.rows.filter((row) => row.id !== projectId),
        links: Object.fromEntries(Object.entries(current.links).map(([id, link]) => [id, link === projectId ? null : link])),
      }));
      return Promise.resolve({ success: true, data: null });
    },
  };
}

/** A tiny store for the fixture's projects, so the stand-in API can read and write outside render. */
export function createFixtureProjectsStore(titles: ReadonlyMap<string, string>) {
  let state = initialFixtureProjects();
  const listeners = new Set<() => void>();
  const read = () => state;
  const update: Update = (change) => {
    state = change(state);
    for (const listener of listeners) listener();
  };
  return {
    read,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    api: fixtureProjectsApi(read, update, (id) => titles.get(id) ?? ""),
  };
}
