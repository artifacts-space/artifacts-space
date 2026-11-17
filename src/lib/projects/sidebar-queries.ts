import { eq, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { project } from "@/db/schema";

import type { ListScope } from "./queries";
import { sharedTeamIdsFor } from "./scope";

/**
 * The project rows behind the sidebar's Projects group. Personal and team
 * are separate: a person's own list holds only the projects they made, and a
 * team's tab holds only that team's. A team's project never shows in a
 * person's own list, whatever it holds, so nobody renames or deletes one
 * from a list that reads as theirs. Never another person's or team's.
 */

/** A project row as the sidebar loads it: its scope is the team, or the viewer when teamId is null. */
export interface SidebarProjectSource {
  id: string;
  name: string;
  icon: string | null;
  teamId: string | null;
}

/**
 * Which project rows a list's sidebar may show: on a team tab, that team's,
 * and only when the viewer belongs to it; on every other list, the viewer's
 * own and nothing else. Null when there is nothing they may see.
 */
export async function sidebarProjectCondition(viewerId: string, scope: ListScope): Promise<SQL | null> {
  if (scope.kind !== "team") return eq(project.userId, viewerId);
  const shared = await sharedTeamIdsFor(viewerId);
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
