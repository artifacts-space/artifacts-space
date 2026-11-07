import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, project, team } from "@/db/schema";
import { getEditableArtifact } from "@/lib/access";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import type { ArtifactProjectDto } from "@/lib/artifact-types";
import { isUniqueViolation } from "@/lib/db-errors";
import { UserFacingError } from "@/lib/user-facing-error";

import { projectIconSchema, projectNameKey, projectNameSchema, sameScope, type ProjectScope } from "./rules";
import { listScopeProjects, type ProjectSummary } from "./queries";
import { canUseScope, inScope, loadHomeScope } from "./scope";
import { findOrCreateProject, findProjectByName, loadProject, toProjectDto } from "./store";

/**
 * Managing a scope's projects: create, rename, change the icon, merge, and
 * delete. Anyone who may use the scope may manage it: the person for their
 * own projects, any member of a shared team for the team's. Deleting or
 * merging never deletes artifacts; it only moves or clears their project.
 */

const NOT_FOUND = "Project not found.";

/** The project when the viewer may manage its scope; throws "not found" otherwise, whoever owns it. */
async function manageable(viewerId: string, projectId: string) {
  const loaded = await loadProject(projectId);
  if (!loaded || !(await canUseScope(viewerId, loaded.scope))) throw new UserFacingError(NOT_FOUND);
  return loaded;
}

/** Throws "not found" unless the viewer may use the scope. */
export async function assertScopeAccess(viewerId: string, scope: ProjectScope): Promise<void> {
  if (!(await canUseScope(viewerId, scope))) throw new UserFacingError(NOT_FOUND);
}

/** Creates a project in a scope the viewer may use. An existing name is refused, not reused. */
export async function createProject(viewerId: string, scope: ProjectScope, input: { name: string; icon?: string | null | undefined }): Promise<ArtifactProjectDto> {
  const name = projectNameSchema.parse(input.name);
  const icon = projectIconSchema.parse(input.icon ?? null);
  await assertScopeAccess(viewerId, scope);
  await enforceRateLimit("organize", viewerId);
  if (await findProjectByName(scope, name)) throw new UserFacingError("A project with that name already exists.");
  return toProjectDto(await findOrCreateProject(scope, name, viewerId, icon));
}

/** Renames a project. A name another project in the scope has is refused: merge them instead. */
export async function renameProject(viewerId: string, projectId: string, nextName: string): Promise<ArtifactProjectDto> {
  const name = projectNameSchema.parse(nextName);
  const { row, scope } = await manageable(viewerId, projectId);
  await enforceRateLimit("organize", viewerId);
  const clash = await findProjectByName(scope, name);
  if (clash && clash.id !== row.id) throw new UserFacingError(`"${clash.name}" already exists. Merge the two projects instead.`);
  try {
    const [updated] = await getDb()
      .update(project)
      .set({ name, nameKey: projectNameKey(name), updatedAt: new Date() })
      .where(and(eq(project.id, row.id), inScope(scope)))
      .returning();
    if (!updated) throw new UserFacingError(NOT_FOUND);
    return toProjectDto(updated);
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("Another project took that name just now. Merge the two projects instead.");
    throw error;
  }
}

/** Sets or removes a project's icon: one emoji or "tabler:<name>". */
export async function setProjectIcon(viewerId: string, projectId: string, nextIcon: string | null): Promise<ArtifactProjectDto> {
  const icon = projectIconSchema.parse(nextIcon);
  const { row } = await manageable(viewerId, projectId);
  await enforceRateLimit("organize", viewerId);
  const [updated] = await getDb().update(project).set({ icon, updatedAt: new Date() }).where(eq(project.id, row.id)).returning();
  if (!updated) throw new UserFacingError(NOT_FOUND);
  return toProjectDto(updated);
}

/**
 * Merges one project into another in the same scope: every artifact in the
 * source moves to the target, then the source is deleted.
 */
export async function mergeProjects(viewerId: string, sourceId: string, targetId: string): Promise<ArtifactProjectDto> {
  if (sourceId === targetId) throw new UserFacingError("Pick a different project to merge into.");
  const [source, target] = await Promise.all([manageable(viewerId, sourceId), manageable(viewerId, targetId)]);
  if (!sameScope(source.scope, target.scope)) throw new UserFacingError(NOT_FOUND);
  await enforceRateLimit("organize", viewerId);
  const db = getDb();
  // The deprecated label is cleared with every link change (see linkColumns in store.ts).
  await db.update(artifact).set({ projectId: target.row.id, project: "" }).where(eq(artifact.projectId, source.row.id));
  // Anything linked to the source in between loses its project rather than blocking the merge.
  await db.delete(project).where(eq(project.id, source.row.id));
  return toProjectDto(target.row);
}

/** Deletes a project. Its artifacts stay and show "No project". */
export async function deleteProject(viewerId: string, projectId: string): Promise<void> {
  const { row } = await manageable(viewerId, projectId);
  await enforceRateLimit("organize", viewerId);
  // The artifacts stay; their deprecated label goes too, so a label backfill never brings the project back.
  await getDb().update(artifact).set({ project: "" }).where(eq(artifact.projectId, row.id));
  await getDb().delete(project).where(eq(project.id, row.id));
}

/** The projects an artifact can move to, and where its scope's projects are managed. */
export interface ArtifactProjectChoices {
  projects: ProjectSummary[];
  /** The team's slug when the artifact's projects are a team's; null for the person's own. */
  teamSlug: string | null;
}

/** The projects of an artifact's home scope, for an editor. Undefined when they may not edit it. */
export async function listArtifactProjects(editorId: string, artifactId: string): Promise<ArtifactProjectChoices | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  const scope = await loadHomeScope(record);
  const [projects, slug] = await Promise.all([listScopeProjects(scope), scope.kind === "team" ? teamSlugOf(scope.teamId) : Promise.resolve(null)]);
  return { projects, teamSlug: slug };
}

async function teamSlugOf(teamId: string): Promise<string | null> {
  const [row] = await getDb().select({ slug: team.slug }).from(team).where(eq(team.id, teamId)).limit(1);
  return row?.slug ?? null;
}
