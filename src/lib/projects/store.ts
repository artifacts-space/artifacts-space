import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, project, type ArtifactRecord, type ProjectRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import type { ArtifactProjectDto } from "@/lib/artifact-types";
import { UserFacingError } from "@/lib/user-facing-error";

import { projectLimits } from "./limits";
import { projectNameKey, sameScope, scopeIsFull, scopeOfRow, type ProjectScope } from "./rules";
import { inScope, loadHomeScope, scopeColumns } from "./scope";

/**
 * Linking artifacts to projects. An artifact's project always lives in its
 * home scope (see rules.ts): choosing one by name finds or creates it there,
 * choosing one by id is refused unless it is there, and a sharing change
 * moves the link to the new home scope. Moving an artifact between projects
 * never files a version and never waits for approval.
 */

const FULL_MESSAGE = `This space already has ${String(projectLimits.maxPerScope)} projects. Merge or delete some first.`;

/** The DTO for a project row. */
export function toProjectDto(row: Pick<ProjectRecord, "id" | "name" | "icon">): ArtifactProjectDto {
  return { id: row.id, name: row.name, icon: row.icon };
}

/** The project in a scope with this name, compared case-insensitively, or null. */
export async function findProjectByName(scope: ProjectScope, name: string): Promise<ProjectRecord | null> {
  const [row] = await getDb().select().from(project).where(and(inScope(scope), eq(project.nameKey, projectNameKey(name)))).limit(1);
  return row ?? null;
}

async function assertRoomInScope(scope: ProjectScope) {
  const [row] = await getDb().select({ total: count() }).from(project).where(inScope(scope));
  if (scopeIsFull(row?.total ?? 0)) throw new UserFacingError(FULL_MESSAGE);
}

/**
 * The scope's project with this (normalized) name, created when there is
 * none. Two writers racing on one name end up with the same row.
 */
export async function findOrCreateProject(scope: ProjectScope, name: string, createdBy: string, icon: string | null = null): Promise<ProjectRecord> {
  const existing = await findProjectByName(scope, name);
  if (existing) return existing;
  await assertRoomInScope(scope);
  await getDb()
    .insert(project)
    .values({ id: randomUUID(), ...scopeColumns(scope), name, nameKey: projectNameKey(name), icon, createdBy })
    .onConflictDoNothing();
  const created = await findProjectByName(scope, name);
  if (!created) throw new Error("The project could not be created.");
  return created;
}

/** A project row by id, with its scope. Null when it does not exist. */
export async function loadProject(projectId: string): Promise<{ row: ProjectRecord; scope: ProjectScope } | null> {
  const [row] = await getDb().select().from(project).where(eq(project.id, projectId)).limit(1);
  const scope = row ? scopeOfRow(row) : null;
  return row && scope ? { row, scope } : null;
}

/** How a project is chosen: by name (found or created in the home scope), by id, or none. */
export type ProjectChoice = { name: string } | { projectId: string } | { none: true };

async function resolveChoice(choice: ProjectChoice, scope: ProjectScope, editorId: string): Promise<ProjectRecord | null> {
  if ("none" in choice) return null;
  if ("name" in choice) return findOrCreateProject(scope, choice.name, editorId);
  const loaded = await loadProject(choice.projectId);
  // Projects of another person or team are "not found", whoever owns them.
  if (!loaded || !sameScope(loaded.scope, scope)) throw new UserFacingError("Project not found. Pick one of this artifact's projects.");
  return loaded.row;
}

/** Links an artifact to a project (or none) without touching its content, history, or save time. */
export async function linkArtifactProject(record: ArtifactRecord, choice: ProjectChoice, editorId: string): Promise<ArtifactProjectDto | null> {
  const scope = await loadHomeScope(record);
  const chosen = await resolveChoice(choice, scope, editorId);
  await getDb().update(artifact).set({ projectId: chosen?.id ?? null }).where(eq(artifact.id, record.id));
  return chosen ? toProjectDto(chosen) : null;
}

/**
 * Moves an artifact the editor may edit into a project, or out of every
 * project. Returns undefined when they may not edit it ("not found").
 * Counts against the organize limit; never files a version.
 */
export async function setArtifactProject(editorId: string, artifactId: string, choice: ProjectChoice): Promise<ArtifactProjectDto | null | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  await enforceRateLimit("organize", editorId);
  return linkArtifactProject(record, choice, editorId);
}

function nullWhenFull(error: unknown): null {
  if (error instanceof UserFacingError) return null;
  throw error;
}

/**
 * After a sharing change, moves the artifact's project link to its new home
 * scope: the project with the same name there (created, with the same icon,
 * when missing). When the new scope is full the artifact loses its project
 * rather than its sharing change. `actorId` is who changed the sharing.
 */
export async function rehomeArtifactProject(artifactId: string, actorId: string): Promise<void> {
  const [record] = await getDb()
    .select({ id: artifact.id, userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId, projectId: artifact.projectId })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (!record?.projectId) return;
  const [current, home] = await Promise.all([loadProject(record.projectId), loadHomeScope(record)]);
  if (current && sameScope(current.scope, home)) return;
  const target = current ? await findOrCreateProject(home, current.row.name, actorId, current.row.icon).catch(nullWhenFull) : null;
  await getDb().update(artifact).set({ projectId: target?.id ?? null }).where(eq(artifact.id, artifactId));
}
