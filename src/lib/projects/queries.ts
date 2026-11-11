import { and, count, eq, ilike, inArray, isNull, not, notInArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { authoredByViewerCondition } from "@/lib/agents/owner-access";
import { artifact, project, team, type ProjectRecord } from "@/db/schema";
import type { ArtifactVisibility, ArtifactProjectDto } from "@/lib/artifact-types";

import { artifactHomeScope, mergeProjectFacets, sameScope, scopeOfRow, type ProjectFacet, type ProjectFilter, type ProjectScope } from "./rules";
import { sharedTeamIdsFor, usableBy } from "./scope";
import { toProjectDto } from "./store";

/**
 * Project reads for the workspace and MCP: which artifacts show their
 * project to a viewer, filter entries, and list filters. The rule is the
 * home scope's: the author, and members of the shared team an artifact is
 * shared through, see its project; nobody else does.
 */

/** The artifact fields that decide who sees its project. */
export interface OrganizerSubject {
  id: string;
  userId: string;
  visibility: ArtifactVisibility;
  teamId: string | null;
  projectId: string | null;
}

/**
 * Whether the viewer may see an artifact's project and tags: its author, or a
 * member of the shared team it is shared through (the home scope's people).
 * `sharedTeamIds` are the viewer's shared (not personal) teams.
 */
export function seesOrganizers(subject: Omit<OrganizerSubject, "id" | "projectId">, viewerId: string, sharedTeamIds: ReadonlySet<string>): boolean {
  if (subject.userId === viewerId) return true;
  return subject.visibility !== "private" && subject.teamId !== null && sharedTeamIds.has(subject.teamId);
}

async function personalFlags(teamIds: string[]): Promise<Map<string, boolean>> {
  if (teamIds.length === 0) return new Map();
  const rows = await getDb().select({ id: team.id, personal: team.personal }).from(team).where(inArray(team.id, teamIds));
  return new Map(rows.map((row) => [row.id, row.personal]));
}

/**
 * Each artifact's project as this viewer may see it, by artifact id. An
 * artifact the viewer is not allowed to organize maps to null, and so does
 * a link that points outside the artifact's home scope (it never should).
 */
export async function projectsForViewer(subjects: readonly OrganizerSubject[], viewerId: string): Promise<Map<string, ArtifactProjectDto | null>> {
  const result = new Map<string, ArtifactProjectDto | null>(subjects.map((subject) => [subject.id, null]));
  const linked = subjects.filter((subject) => subject.projectId !== null);
  if (linked.length === 0) return result;
  const context = await loadVisibilityContext(linked, viewerId);
  for (const subject of linked) {
    const shown = visibleProject(subject, viewerId, context);
    if (shown) result.set(subject.id, shown);
  }
  return result;
}

interface VisibilityContext {
  shared: ReadonlySet<string>;
  personal: ReadonlyMap<string, boolean>;
  projects: ReadonlyMap<string, ProjectRecord>;
}

function uniqueIds(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

/** The viewer's shared teams, the artifacts' teams' personal flags, and the linked projects, in parallel. */
async function loadVisibilityContext(linked: readonly OrganizerSubject[], viewerId: string): Promise<VisibilityContext> {
  const needsTeams = linked.some((subject) => subject.userId !== viewerId);
  const [shared, personal, rows] = await Promise.all([
    needsTeams ? sharedTeamIdsFor(viewerId) : Promise.resolve(new Set<string>()),
    personalFlags(uniqueIds(linked.map((subject) => subject.teamId))),
    getDb().select().from(project).where(inArray(project.id, uniqueIds(linked.map((subject) => subject.projectId)))),
  ]);
  return { shared, personal, projects: new Map(rows.map((row) => [row.id, row])) };
}

/** The artifact's project when the viewer may see it and it lives in the artifact's home scope; else null. */
function visibleProject(subject: OrganizerSubject, viewerId: string, context: VisibilityContext): ArtifactProjectDto | null {
  if (!seesOrganizers(subject, viewerId, context.shared)) return null;
  const row = subject.projectId ? context.projects.get(subject.projectId) : undefined;
  const rowScope = row ? scopeOfRow(row) : null;
  if (!row || !rowScope) return null;
  const teamPersonal = subject.teamId ? context.personal.get(subject.teamId) ?? null : null;
  return sameScope(rowScope, artifactHomeScope(subject, teamPersonal)) ? toProjectDto(row) : null;
}

/** Which artifacts a list shows, as project queries need it. Mirrors ArtifactScope in src/lib/artifacts.ts. */
export type ListScope = { kind: "mine" } | { kind: "team"; teamId: string };

/** The projects a list's artifacts can point at: the viewer's own and their shared teams' (mine), or the team's. */
async function projectCondition(viewerId: string, scope: ListScope): Promise<SQL> {
  if (scope.kind === "team") return eq(project.teamId, scope.teamId);
  return usableBy(viewerId, await sharedTeamIdsFor(viewerId));
}

export type { ProjectFilter } from "./rules";

/**
 * SQL for the project filter, on top of the list's own scope condition.
 * The subquery is not correlated (see the tripwire in AGENTS.md): it lists
 * project ids in the viewer's usable scopes with that key.
 */
export async function projectFilterCondition(viewerId: string, scope: ListScope, filter: ProjectFilter): Promise<SQL> {
  const usable = await projectCondition(viewerId, scope);
  if ("none" in filter) {
    // Unfiled: no project, or one the viewer cannot use in this list, so it holds what the facets count as unfiled.
    const unfiled = or(isNull(artifact.projectId), notInArray(artifact.projectId, getDb().select({ id: project.id }).from(project).where(usable)));
    if (!unfiled) throw new Error("The unfiled condition could not be built.");
    return unfiled;
  }
  const ids = getDb().select({ id: project.id }).from(project).where(and(usable, eq(project.nameKey, filter.key)));
  return inArray(artifact.projectId, ids);
}

/** SQL matching artifacts whose project name contains the pattern, among the viewer's usable projects. */
export async function projectSearchCondition(viewerId: string, scope: ListScope, pattern: string): Promise<SQL> {
  const ids = getDb().select({ id: project.id }).from(project).where(and(await projectCondition(viewerId, scope), ilike(project.name, pattern)));
  return inArray(artifact.projectId, ids);
}

/** What the project filter offers for one list. */
export interface ProjectFacets {
  /** One entry per project name, with how many artifacts in the list it holds. */
  projects: ProjectFacet[];
  /** Artifacts in the list with no project the viewer can use here: Unfiled. */
  none: number;
  /** Every artifact in the list. */
  total: number;
  /** Artifacts in the list that someone else wrote (not the viewer or their agents): the Shared with me view. */
  shared: number;
  /** Artifacts in the list anyone can read: the Public view. */
  public: number;
}

/**
 * How facet counts join artifacts to projects: only projects the viewer may
 * use in this list scope. A link that points anywhere else (it never should)
 * never names a filter entry.
 */
export async function facetJoinCondition(viewerId: string, scope: ListScope): Promise<SQL | undefined> {
  return and(eq(project.id, artifact.projectId), await projectCondition(viewerId, scope));
}

/**
 * One row over the list: every artifact, those someone else wrote (not the
 * viewer or their agents: Shared with me), and the public ones. One table,
 * and the agents subquery is not correlated (see the tripwire in AGENTS.md).
 */
export function facetTotalsQuery(viewerId: string, listCondition: SQL) {
  const db = getDb();
  return db
    .select({
      total: count(),
      shared: sql<number>`count(*) filter (where ${not(authoredByViewerCondition(db, viewerId))})`.mapWith(Number),
      public: sql<number>`count(*) filter (where ${artifact.visibility} = 'public')`.mapWith(Number),
    })
    .from(artifact)
    .where(listCondition);
}

/**
 * The project filter's entries for a list scope, counted in the database so
 * they cover every artifact, not only the first page. `listCondition` is the
 * list's scope condition on artifact (the viewer's own, or a team's).
 */
export async function loadProjectFacets(viewerId: string, scope: ListScope, listCondition: SQL): Promise<ProjectFacets> {
  const db = getDb();
  const usable = await facetJoinCondition(viewerId, scope);
  const [perProject, totals] = await Promise.all([
    db
      .select({ id: project.id, name: project.name, nameKey: project.nameKey, icon: project.icon, userId: project.userId, count: count(artifact.id) })
      .from(artifact)
      .innerJoin(project, usable)
      .where(listCondition)
      .groupBy(project.id),
    facetTotalsQuery(viewerId, listCondition),
  ]);
  const projects = mergeProjectFacets(perProject.map((row) => ({ ...row, own: row.userId === viewerId })));
  const total = totals[0]?.total ?? 0;
  // Every artifact is in at most one project, so what no usable project holds is Unfiled.
  const filed = perProject.reduce((sum, row) => sum + row.count, 0);
  return { projects, none: Math.max(0, total - filed), total, shared: totals[0]?.shared ?? 0, public: totals[0]?.public ?? 0 };
}

/** One project in a scope's list, with how many artifacts it holds. */
export interface ProjectSummary extends ArtifactProjectDto {
  count: number;
}

/** Every project in a scope with its artifact count, by name. The caller checks the viewer may use the scope. */
export async function listScopeProjects(scope: ProjectScope): Promise<ProjectSummary[]> {
  const condition = scope.kind === "user" ? eq(project.userId, scope.userId) : eq(project.teamId, scope.teamId);
  const rows = await getDb()
    .select({ id: project.id, name: project.name, icon: project.icon, count: count(artifact.id) })
    .from(project)
    .leftJoin(artifact, eq(artifact.projectId, project.id))
    .where(condition)
    .groupBy(project.id)
    .orderBy(project.nameKey);
  return rows;
}
