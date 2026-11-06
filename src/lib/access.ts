import { and, eq, exists, ne } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { artifact, teamMember, type ArtifactRecord } from "@/db/schema";
import { canEditArtifact, canViewArtifact } from "@/lib/access-rules";
import { isPublicId } from "@/lib/public-id";

/**
 * The one access check for reading artifacts. Every read path (the public
 * page, the workspace, MCP tools, and APIs) goes through getViewableArtifact
 * for one artifact, or listArtifacts (which uses viewableInTeamCondition) for
 * lists. The rule itself lives in access-rules.ts.
 */

/** True when the user is a member of the team. */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
  return Boolean(row);
}

/**
 * SQL for "shared with this team and readable by this viewer": the artifact
 * names the team, is not private, and the viewer is a member of the team.
 */
export function viewableInTeamCondition(viewerId: string, teamId: string) {
  const membership = getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, viewerId)));
  const condition = and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private"), exists(membership));
  if (!condition) throw new Error("The team scope could not be built.");
  return condition;
}

/** An artifact the viewer may read, with what else they may do. */
export interface ViewableArtifact {
  record: ArtifactRecord;
  canEdit: boolean;
  /** Whether the viewer belongs to the artifact's team. Pages show the team's name only then. */
  isTeamMember: boolean;
}

async function viewerIsMember(viewerId: string | null, teamId: string | null) {
  if (!viewerId || !teamId) return false;
  return isTeamMember(viewerId, teamId);
}

/**
 * Loads an artifact by public id for a viewer (null when signed out). Returns
 * null when it does not exist or the viewer may not read it, so callers show
 * the same "not found" either way. Deduplicated per request.
 */
export const getViewableArtifact = cache(async (publicId: string, viewerId: string | null): Promise<ViewableArtifact | null> => {
  if (!isPublicId(publicId)) return null;
  const [record] = await getDb().select().from(artifact).where(eq(artifact.publicId, publicId)).limit(1);
  if (!record) return null;
  const member = record.visibility === "private" ? false : await viewerIsMember(viewerId, record.teamId);
  if (!canViewArtifact(record, viewerId ? { userId: viewerId, isTeamMember: member } : null)) return null;
  return { record, canEdit: canEditArtifact(record, viewerId), isTeamMember: member };
});
