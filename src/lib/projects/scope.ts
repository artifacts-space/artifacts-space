import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { project, team, teamMember } from "@/db/schema";

import { artifactHomeScope, type HomeScopeSubject, type ProjectScope } from "./rules";

/**
 * Scopes in the database: which project rows belong to a scope, who may use
 * one, and an artifact's home scope. Every project read and write checks the
 * scope here first.
 */

/** The project columns that name a scope, for inserts. */
export function scopeColumns(scope: ProjectScope): { userId: string | null; teamId: string | null } {
  return scope.kind === "user" ? { userId: scope.userId, teamId: null } : { userId: null, teamId: scope.teamId };
}

/** SQL for "this project row belongs to the scope". */
export function inScope(scope: ProjectScope): SQL {
  return scope.kind === "user" ? eq(project.userId, scope.userId) : eq(project.teamId, scope.teamId);
}

/** The shared (not personal) teams the user belongs to. Their projects are the user's to use. */
export async function sharedTeamIdsFor(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, userId), eq(team.personal, false)));
  return new Set(rows.map((row) => row.teamId));
}

/**
 * Whether the viewer may see and change a scope's projects: their own, or a
 * shared team they belong to. Personal teams never hold projects.
 */
export async function canUseScope(viewerId: string, scope: ProjectScope): Promise<boolean> {
  if (scope.kind === "user") return scope.userId === viewerId;
  const [row] = await getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, viewerId), eq(teamMember.teamId, scope.teamId), eq(team.personal, false)))
    .limit(1);
  return Boolean(row);
}

/** SQL for "projects the viewer may use": their own, and those of the shared teams they belong to. */
export function usableBy(viewerId: string, teamIds: ReadonlySet<string>): SQL {
  const own = eq(project.userId, viewerId);
  if (teamIds.size === 0) return own;
  const combined = or(own, inArray(project.teamId, [...teamIds]));
  if (!combined) throw new Error("The project scope could not be built.");
  return combined;
}

/** The artifact's home scope, reading whether its team is personal. */
export async function loadHomeScope(subject: HomeScopeSubject): Promise<ProjectScope> {
  if (subject.visibility === "private" || subject.teamId === null) return artifactHomeScope(subject, null);
  const [row] = await getDb().select({ personal: team.personal }).from(team).where(eq(team.id, subject.teamId)).limit(1);
  return artifactHomeScope(subject, row?.personal ?? null);
}
