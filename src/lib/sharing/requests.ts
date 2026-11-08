import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, sharingRequest } from "@/db/schema";
import { isTeamMember } from "@/lib/access";
import { actsForAuthor } from "@/lib/agents/owner-access";
import type { ArtifactDto, CommentSetting, SharingLevel } from "@/lib/artifact-types";
import { toArtifactDtos } from "@/lib/artifacts";
import { isUniqueViolation } from "@/lib/db-errors";
import { UserFacingError } from "@/lib/user-facing-error";
import { forgetArtifactCache } from "@/lib/versions/cache";

import { requestStillValid } from "./rules";

/**
 * Helpers shared by sharing changes (service.ts) and comments setting
 * changes (comments.ts): the DTO after a change, and the open request to
 * open comments to anyone signed in.
 */

/** The workspace DTO for an artifact after a change, as `viewerId` (who made the change) may see it. */
export async function dtoFor(artifactId: string, viewerId: string): Promise<ArtifactDto> {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) throw new UserFacingError("Artifact not found.");
  const [dto] = await toArtifactDtos([record], viewerId);
  if (!dto) throw new UserFacingError("Artifact not found.");
  return dto;
}

/** Cancels the open request to open comments, when a newer change replaces it. */
export async function cancelPendingComments(artifactId: string, byUserId: string) {
  await getDb()
    .update(sharingRequest)
    .set({ status: "canceled", decidedBy: byUserId, decidedAt: new Date() })
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "comments"), eq(sharingRequest.status, "pending")));
}

/** Files a request to open comments to anyone signed in, for the team's owners and admins. */
export async function storeCommentsRequest(input: { artifactId: string; teamId: string; level: SharingLevel; requesterId: string; comments: CommentSetting }) {
  try {
    await getDb().insert(sharingRequest).values({
      id: randomUUID(),
      artifactId: input.artifactId,
      teamId: input.teamId,
      requestedBy: input.requesterId,
      kind: "comments",
      visibility: input.level,
      comments: input.comments,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("A request to change comments on this artifact is already waiting.");
    throw error;
  }
}

/**
 * Stores the comments setting. The page reads the setting fresh on every
 * request, but the artifact's cache entries are dropped too, so nothing
 * cached for the old setting outlives it (see src/lib/versions/cache.ts).
 */
export async function applyComments(artifactId: string, comments: CommentSetting) {
  await getDb().update(artifact).set({ comments }).where(eq(artifact.id, artifactId));
  forgetArtifactCache(artifactId);
}

/**
 * Whether a request may still be approved (requestStillValid): the author is
 * still in its team, and whoever asked still speaks for the author.
 */
export async function requestStillHolds(request: { requestedBy: string; teamId: string }, authorId: string): Promise<boolean> {
  const [authorInTeam, requesterActsForAuthor] = await Promise.all([
    isTeamMember(authorId, request.teamId),
    request.requestedBy === authorId ? false : actsForAuthor(request.requestedBy, authorId),
  ]);
  return requestStillValid({ authorId, requestedBy: request.requestedBy, requesterActsForAuthor, authorInTeam });
}
