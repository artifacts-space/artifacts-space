import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, sharingRequest, team, type ArtifactRecord, type SharingRequestRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { commentSettings, type ArtifactDto, type CommentSetting } from "@/lib/artifact-types";
import { canChangeCommentSetting, decideCommentSetting } from "@/lib/comments/setting-rules";
import { getTeamMembershipById, type TeamMembership } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";
import { forgetArtifactCache } from "@/lib/versions/cache";

import { applyComments, cancelPendingComments, dtoFor, requestStillHolds, storeCommentsRequest } from "./requests";
import type { SharingActor, SharingTeamRule } from "./rules";

/**
 * Changes who can read and write an artifact's comments. The author, and
 * owners and admins of its shared team, may change it. Narrowing (off, or
 * team) applies at once and hides comments without deleting them. Opening
 * comments in a shared team to anyone signed in follows the public sharing
 * rule: owners and admins apply it, members and agents wait for approval.
 */

const commentsSchema = z.enum(commentSettings);

export interface CommentsChangeResult {
  status: "applied" | "pending";
  artifact: ArtifactDto;
}

/** The team's sharing rule and the viewer's role in it. Both null for an artifact without a team. */
async function teamContext(viewerId: string, teamId: string | null): Promise<{ rule: SharingTeamRule | null; member: TeamMembership | null }> {
  if (!teamId) return { rule: null, member: null };
  const membership = await getTeamMembershipById(viewerId, teamId);
  if (membership) return { rule: membership, member: membership };
  const [row] = await getDb().select({ personal: team.personal, teamSharingNeedsApproval: team.teamSharingNeedsApproval }).from(team).where(eq(team.id, teamId)).limit(1);
  return { rule: row ?? null, member: null };
}

async function loadArtifact(artifactId: string): Promise<ArtifactRecord | null> {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  return record ?? null;
}

/**
 * Sets an artifact's comments setting, now or as a request for approval.
 * `actor` is "agent" for MCP calls, which never approve. Callers outside the
 * author and the team's owners and admins get "not found".
 */
export async function setArtifactComments(input: { actorId: string; artifactId: string; comments: CommentSetting; actor: SharingActor }): Promise<CommentsChangeResult> {
  const next = commentsSchema.parse(input.comments);
  const record = await loadArtifact(input.artifactId);
  if (!record) throw new UserFacingError("Artifact not found.");
  const { rule, member } = await teamContext(input.actorId, record.teamId);
  const allowed = canChangeCommentSetting({ viewerId: input.actorId, authorId: record.userId, member, teamPersonal: rule?.personal ?? null, actor: input.actor });
  if (!allowed) throw new UserFacingError("Artifact not found, or you cannot change its comments. Its author and the team's owners and admins can.");
  if (next !== "off") await enforceRateLimit("sharingRequest", input.actorId);

  const outcome = decideCommentSetting({ current: record.comments, next, sameTeam: true, team: rule, member, actor: input.actor });
  await cancelPendingComments(record.id, input.actorId);
  const level = record.visibility === "private" ? null : record.visibility;
  if (outcome === "pending" && record.teamId && level) {
    await storeCommentsRequest({ artifactId: record.id, teamId: record.teamId, level, requesterId: input.actorId, comments: next });
    return { status: "pending", artifact: await dtoFor(record.id, input.actorId) };
  }
  await applyComments(record.id, next);
  return { status: "applied", artifact: await dtoFor(record.id, input.actorId) };
}

/**
 * Approves an open request to change comments. It applies only while the
 * artifact is still shared through the request's team and the requester can
 * still change it; otherwise the request is canceled.
 */
export async function approveCommentsRequest(request: SharingRequestRecord, deciderId: string) {
  const record = await loadArtifact(request.artifactId);
  const stillHere = record !== null && record.teamId === request.teamId && (await requestStillHolds(request, record.userId));
  if (!stillHere) {
    await cancelPendingComments(request.artifactId, deciderId);
    throw new UserFacingError("The artifact moved, turned private, or its author left the team, so the request was canceled.");
  }
  // One statement: the request is approved only if it was still open, and the artifact changes with it.
  await getDb().execute(sql`
    with decided as (
      update ${sharingRequest} set status = 'approved', decided_by = ${deciderId}, decided_at = now()
      where id = ${request.id} and status = 'pending' and kind = 'comments'
      returning artifact_id, team_id, comments
    )
    update ${artifact} set comments = decided.comments
    from decided
    where ${artifact.id} = decided.artifact_id and ${artifact.teamId} = decided.team_id and decided.comments is not null
  `);
  forgetArtifactCache(request.artifactId);
}
