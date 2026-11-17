import { and, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { viewableInTeamCondition } from "@/lib/access";
import { authoredByViewerCondition } from "@/lib/agents/owner-access";
import type { ListScope } from "@/lib/projects/queries";
import { homeOutsideTeams, sharedTeamIdsFor } from "@/lib/projects/scope";

/**
 * Which artifacts a list holds. Every artifact has one home
 * (artifactHomeScope in src/lib/projects/rules.ts): the shared team it is
 * shared through, else its author. A workspace lists only the artifacts
 * whose home it is, so the two workspaces never both list one.
 * - personal: the Personal workspace. What the viewer wrote (with their
 *   agents') whose home is not one of the shared teams they are in.
 * - team: a team's workspace. What is shared through that team, for a
 *   member (viewableInTeamCondition): the artifacts whose home is the team.
 * - mine: everything the viewer wrote, whatever its home. Agents list this
 *   over MCP; no workspace does.
 */
export type ArtifactScope = { kind: "mine" } | { kind: "personal" } | { kind: "team"; teamId: string };

/**
 * The viewer's shared teams, read once per request: one page load builds
 * the Personal scope for the list, the project counts, and the tag counts.
 */
const sharedTeamsOnce = cache((viewerId: string) => sharedTeamIdsFor(viewerId));

/**
 * The one SQL condition for a list scope: the list, its counts, its search,
 * and its filters all build on it, so they cannot disagree about what a
 * workspace holds. An artifact the viewer shared through a team they have
 * since left stays in Personal (that team is not one of theirs any more), so
 * nothing they own is ever in neither workspace.
 */
export async function scopeCondition(viewerId: string, scope: ArtifactScope): Promise<SQL> {
  if (scope.kind === "team") return viewableInTeamCondition(viewerId, scope.teamId);
  const authored = authoredByViewerCondition(getDb(), viewerId);
  if (scope.kind === "mine") return authored;
  const personal = homeOutsideTeams(await sharedTeamsOnce(viewerId));
  const condition = personal ? and(authored, personal) : authored;
  if (!condition) throw new Error("The personal scope could not be built.");
  return condition;
}

/**
 * The scope project queries read for a list. Personal reads as "mine": its
 * artifacts only ever point at the viewer's own projects, so the wider set
 * of projects matches the same rows.
 */
export function projectScopeOf(scope: ArtifactScope): ListScope {
  return scope.kind === "team" ? scope : { kind: "mine" };
}
