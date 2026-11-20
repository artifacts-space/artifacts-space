import type { ArtifactDto } from "@/lib/artifact-types";
import { siteUrl } from "@/lib/site-origin";
import type { TeamMembership } from "@/lib/teams/queries";

import { loadMcpActors } from "./actors";
import { artifactActorIds, type McpViewContext } from "./artifact-view";

/** The caller's teams as an MCP result reads them: slug and whether it is personal, by team id. */
function teamsById(teams: readonly Pick<TeamMembership, "id" | "slug" | "personal">[]): McpViewContext["teams"] {
  return new Map(teams.map((team) => [team.id, { slug: team.slug, personal: team.personal }]));
}

/** A view context that names nobody yet: for slugs, before any artifact is loaded. */
export function baseViewContext(viewerId: string, teams: readonly Pick<TeamMembership, "id" | "slug" | "personal">[]): McpViewContext {
  return { viewerId, teams: teamsById(teams), urlFor: (publicId) => siteUrl(`/artifact/${publicId}`), actors: new Map() };
}

/**
 * The view context for these artifacts: every person and agent they name,
 * looked up together in one round trip (loadMcpActors), however many
 * artifacts there are.
 */
export async function withActors(context: McpViewContext, dtos: readonly Pick<ArtifactDto, "authorId" | "originalAuthorId" | "updatedBy">[]): Promise<McpViewContext> {
  return { ...context, actors: await loadMcpActors(context.viewerId, artifactActorIds(dtos)) };
}

/**
 * withActors for the result of a save that already landed. A failed lookup
 * never fails that result: an agent told its save failed would save again
 * (a second artifact, from a create). The actors then read as unknown, as
 * the save's mention report does when it fails.
 */
export async function withActorsAfterSave(context: McpViewContext, dtos: readonly Pick<ArtifactDto, "authorId" | "originalAuthorId" | "updatedBy">[]): Promise<McpViewContext> {
  try {
    return await withActors(context, dtos);
  } catch (error) {
    console.error("[mcp] Actors for a saved artifact could not be read", error instanceof Error ? error.name : "unknown error");
    return context;
  }
}
