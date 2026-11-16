import { and, eq, inArray, isNotNull, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, project } from "@/db/schema";
import { authoredByViewerCondition } from "@/lib/agents/owner-access";

import type { ListScope } from "./queries";
import { sharedTeamIdsFor } from "./scope";

/**
 * The project rows behind the sidebar's Projects group. Projects are
 * team-internal: a list only ever gets the viewer's own projects and those
 * of shared teams they belong to, never another person's or team's.
 *
 * The viewer's own list (Mine) is theirs: it holds every project they made,
 * and a team's project only while it holds one of their artifacts there (one
 * they shared with that team). A team's other projects, the empty ones
 * among them, belong on the team's tab, so nobody renames or deletes one
 * by mistake from their own list.
 */

/** A project row as the sidebar loads it: its scope is the team, or the viewer when teamId is null. */
export interface SidebarProjectSource {
  id: string;
  name: string;
  icon: string | null;
  teamId: string | null;
}

/**
 * The viewer's own projects, and their shared teams' projects that hold an
 * artifact of the viewer's list. The subquery reads artifact alone and is
 * not correlated (see the tripwire in AGENTS.md): it lists the project ids
 * the viewer's artifacts point at.
 */
function mineCondition(viewerId: string, shared: ReadonlySet<string>): SQL {
  const own = eq(project.userId, viewerId);
  if (shared.size === 0) return own;
  const db = getDb();
  const holdingViewersArtifacts = db
    .select({ id: artifact.projectId })
    .from(artifact)
    .where(and(authoredByViewerCondition(db, viewerId), isNotNull(artifact.projectId)));
  const combined = or(own, and(inArray(project.teamId, [...shared]), inArray(project.id, holdingViewersArtifacts)));
  if (!combined) throw new Error("The project scope could not be built.");
  return combined;
}

/**
 * Which project rows a list's sidebar may show: on Mine, the viewer's own,
 * and a shared team's only while it holds one of the viewer's artifacts; on
 * a team tab, that team's, and only when the viewer belongs to it. Null
 * when there is nothing they may see.
 */
export async function sidebarProjectCondition(viewerId: string, scope: ListScope): Promise<SQL | null> {
  const shared = await sharedTeamIdsFor(viewerId);
  if (scope.kind === "mine") return mineCondition(viewerId, shared);
  return shared.has(scope.teamId) ? eq(project.teamId, scope.teamId) : null;
}

/** Every project the viewer may manage from a list's sidebar, by name. */
export async function listSidebarProjects(viewerId: string, scope: ListScope): Promise<SidebarProjectSource[]> {
  const condition = await sidebarProjectCondition(viewerId, scope);
  if (!condition) return [];
  return getDb()
    .select({ id: project.id, name: project.name, icon: project.icon, teamId: project.teamId })
    .from(project)
    .where(condition)
    .orderBy(project.nameKey);
}
