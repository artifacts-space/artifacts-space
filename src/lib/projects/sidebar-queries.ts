import { eq, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { project } from "@/db/schema";

import type { ListScope } from "./queries";
import { sharedTeamIdsFor, usableBy } from "./scope";

/**
 * The project rows behind the sidebar's Projects group. Projects are
 * team-internal: a list only ever gets the viewer's own projects and those
 * of shared teams they belong to, never another person's or team's.
 */

/** A project row as the sidebar loads it: its scope is the team, or the viewer when teamId is null. */
export interface SidebarProjectSource {
  id: string;
  name: string;
  icon: string | null;
  teamId: string | null;
}

/**
 * Which project rows a list's sidebar may show: on Mine, the viewer's own
 * and their shared teams'; on a team tab, that team's, and only when the
 * viewer belongs to it. Null when there is nothing they may see.
 */
export async function sidebarProjectCondition(viewerId: string, scope: ListScope): Promise<SQL | null> {
  const shared = await sharedTeamIdsFor(viewerId);
  if (scope.kind === "mine") return usableBy(viewerId, shared);
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
