import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { agent, artifact, sharingRequest, type ArtifactRecord } from "@/db/schema";
import { isTeamMember } from "@/lib/access";
import { actsForAuthor } from "@/lib/agents/owner-access";
import type { ArtifactDto, ArtifactVisibility, CommentSetting, SharingLevel } from "@/lib/artifact-types";
import { commentsAfterSharing, decideCommentSetting, defaultCommentSetting } from "@/lib/comments/setting-rules";
import { isUniqueViolation } from "@/lib/db-errors";
import { notifySharingDecision, notifySharingRequest } from "@/lib/notifications/create";
import { rehomeArtifactProject } from "@/lib/projects/store";
import { getTeamMembershipById, listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";
import { decideEditRequest, syncApprovedVersion } from "@/lib/versions/service";

import { approveCommentsRequest } from "./comments";
import { cancelPendingComments, dtoFor, requestStillHolds, storeCommentsRequest } from "./requests";
import {
  agentArtifactTeamProblem,
  canDecideRequest,
  canWithdrawSharing,
  decideSharing,
  isLevelAllowedInTeam,
  sharingNeedsApproval,
  type SharingActor,
} from "./rules";
import { chooseSharingTeam, notAMemberError } from "./team-choice-rules";

/**
 * Every sharing change goes through this module. requestArtifactSharing
 * applies a change at once when the team's rule allows it, or stores a
 * pending request and leaves visibility unchanged. Owners and admins decide
 * requests with decideSharingRequest and can withdraw sharing at any time.
 */

export interface SharingRequestInput {
  requesterId: string;
  /** Internal artifact id. Only the author, or the person who added the agent that wrote it, may request sharing. */
  artifactId: string;
  visibility: ArtifactVisibility;
  /**
   * The team to share with (team), or whose admins approve it (link, public).
   * Left out: the artifact's current team, then (link and public) the
   * personal team, then the requester's only team. See team-choice-rules.ts.
   */
  teamId?: string | null | undefined;
  /**
   * Who may comment afterwards. Left out: the current setting when the
   * artifact stays in the same team or turns private, else the default for
   * the new level and team (see setting-rules.ts).
   */
  comments?: CommentSetting | undefined;
  actor: SharingActor;
}

export interface SharingResult {
  /** pending when the sharing change, or opening its comments, waits for approval. */
  status: "applied" | "pending";
  /** pending when only opening comments to anyone signed in waits for approval. */
  comments: "applied" | "pending";
  artifact: ArtifactDto;
}

/** Cancels the open sharing request. Edit requests follow syncApprovedVersion instead. */
async function cancelPending(artifactId: string, byUserId: string) {
  await getDb()
    .update(sharingRequest)
    .set({ status: "canceled", decidedBy: byUserId, decidedAt: new Date() })
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "sharing"), eq(sharingRequest.status, "pending")));
}

/**
 * Moves the artifact's project to its new home scope (src/lib/projects).
 * The sharing change already happened; a failure here never undoes it, and
 * a stale link is never shown (projectsForViewer checks the scope).
 */
async function rehomeProjectQuietly(artifactId: string) {
  await rehomeArtifactProject(artifactId).catch((error: unknown) => {
    console.error("[projects] Project did not follow a sharing change", error instanceof Error ? error.name : "unknown error");
  });
}

async function setVisibility(artifactId: string, visibility: ArtifactVisibility, teamId: string | null, byUserId: string, comments?: CommentSetting) {
  // "Show in search engines" stays only while the artifact stays public (showInSearchAfterSharing).
  const keepsSearch = visibility === "public" ? {} : { showInSearch: false };
  await getDb()
    .update(artifact)
    .set({ visibility, teamId, ...keepsSearch, ...(comments ? { comments } : {}) })
    .where(eq(artifact.id, artifactId));
  await rehomeProjectQuietly(artifactId);
  // An open edit request follows the artifact to its new approving team.
  if (teamId) {
    await getDb()
      .update(sharingRequest)
      .set({ teamId })
      .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")));
  }
  await syncApprovedVersion(artifactId, byUserId);
}

/** The team the change goes through: the one asked for, else the artifact's current team, else a default (team-choice-rules.ts). */
async function resolveTeam(requesterId: string, level: SharingLevel, teamId: string | null | undefined, currentTeamId: string | null): Promise<TeamMembership> {
  const memberships = await listTeamsForUser(requesterId);
  const choice = chooseSharingTeam({ level, requestedTeamId: teamId, currentTeamId, memberships });
  if (!choice.ok) throw new UserFacingError(choice.error);
  const membership = memberships.find((item) => item.id === choice.teamId);
  if (!membership) throw new UserFacingError(notAMemberError);
  if (!isLevelAllowedInTeam(level, membership)) {
    throw new UserFacingError("Your personal team is only you. Choose a shared team, or share by link.");
  }
  return membership;
}

async function recordDecision(record: ArtifactRecord, team: TeamMembership, level: SharingLevel, requesterId: string) {
  await getDb().insert(sharingRequest).values({
    id: randomUUID(),
    artifactId: record.id,
    teamId: team.id,
    requestedBy: requesterId,
    visibility: level,
    status: "approved",
    decidedBy: requesterId,
    decidedAt: new Date(),
  });
}

async function storeRequest(record: ArtifactRecord, team: TeamMembership, level: SharingLevel, requesterId: string, comments: CommentSetting) {
  const id = randomUUID();
  try {
    await getDb().insert(sharingRequest).values({ id, artifactId: record.id, teamId: team.id, requestedBy: requesterId, visibility: level, comments });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("A sharing request for this artifact is already waiting.");
    throw error;
  }
  notifySharingRequest(id);
}

/**
 * The artifact when the requester may change who reads it: its author, or the
 * person who added the agent that wrote it (src/lib/agents/owner-access.ts).
 * `agentTeamId` is the agent's team when the requester acts for it.
 */
async function shareableArtifact(requesterId: string, artifactId: string): Promise<{ record: ArtifactRecord; agentTeamId: string | null } | null> {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) return null;
  if (record.userId === requesterId) return { record, agentTeamId: null };
  if (!(await actsForAuthor(requesterId, record.userId))) return null;
  const [row] = await getDb().select({ teamId: agent.teamId }).from(agent).where(eq(agent.userId, record.userId)).limit(1);
  return row ? { record, agentTeamId: row.teamId } : null;
}

/** For the person who shares an agent's artifact: the agent's team unless they named one, which must include the agent. */
async function teamForAgentArtifact(record: ArtifactRecord, agentTeamId: string, team: TeamMembership) {
  const problem = agentArtifactTeamProblem({ authorInTeam: team.id === agentTeamId && (await isTeamMember(record.userId, team.id)) });
  if (problem) throw new UserFacingError(problem);
}

/**
 * Asks to change who can read an artifact. Making it private always applies.
 * Otherwise the team's rule decides: the change applies now, or a pending
 * request waits for an owner or admin and visibility stays as it is. A new
 * request replaces an older open one.
 */
export async function requestArtifactSharing(input: SharingRequestInput): Promise<SharingResult> {
  const shareable = await shareableArtifact(input.requesterId, input.artifactId);
  if (!shareable) throw new UserFacingError("Artifact not found. Only its author, or the person who added the agent that wrote it, can share it.");
  const { record, agentTeamId } = shareable;

  if (input.visibility === "private") {
    await cancelPending(record.id, input.requesterId);
    await cancelPendingComments(record.id, input.requesterId);
    // Private artifacts are only the author's, so any setting applies without approval.
    const comments = commentsAfterSharing({ current: record.comments, requested: input.comments, sameTeam: true, next: { visibility: "private", teamPersonal: null } });
    await setVisibility(record.id, "private", null, input.requesterId, comments);
    return { status: "applied", comments: "applied", artifact: await dtoFor(record.id, input.requesterId) };
  }

  await enforceRateLimit("sharingRequest", input.requesterId);
  const level = input.visibility;
  // The person who shares an agent's artifact shares it through the agent's team unless they name one.
  const team = await resolveTeam(input.requesterId, level, input.teamId ?? agentTeamId, record.teamId);
  if (agentTeamId) await teamForAgentArtifact(record, agentTeamId, team);
  const sameTeam = record.teamId === team.id;
  const comments = commentsAfterSharing({ current: record.comments, requested: input.comments, sameTeam, next: { visibility: level, teamPersonal: team.personal } });
  await cancelPending(record.id, input.requesterId);
  const outcome = decideSharing({ level, team, role: team.role, actor: input.actor });
  if (outcome === "pending") {
    // The comments setting waits with the request; the approver approves both.
    await storeRequest(record, team, level, input.requesterId, comments);
    return { status: "pending", comments: "pending", artifact: await dtoFor(record.id, input.requesterId) };
  }
  return applySharing({ record, team, level, comments, sameTeam, requesterId: input.requesterId, actor: input.actor });
}

/**
 * Applies a sharing change that needs no (further) approval. Opening comments
 * to anyone signed in can still need approval on its own: the change applies
 * with the default comments setting, and the wider one waits as a request.
 */
async function applySharing(input: { record: ArtifactRecord; team: TeamMembership; level: SharingLevel; comments: CommentSetting; sameTeam: boolean; requesterId: string; actor: SharingActor }): Promise<SharingResult> {
  const { record, team, level, requesterId } = input;
  const commentsOutcome = decideCommentSetting({ current: record.comments, next: input.comments, sameTeam: input.sameTeam, team, role: team.role, actor: input.actor });
  const fallback = input.sameTeam ? record.comments : defaultCommentSetting({ visibility: level, teamPersonal: team.personal });
  await cancelPendingComments(record.id, requesterId);
  await setVisibility(record.id, level, team.id, requesterId, commentsOutcome === "apply" ? input.comments : fallback);
  if (commentsOutcome === "pending") await storeCommentsRequest({ artifactId: record.id, teamId: team.id, level, requesterId, comments: input.comments });
  // Keep an audit row when an owner or admin approved their own change.
  if (sharingNeedsApproval(level, team)) await recordDecision(record, team, level, requesterId);
  const status = commentsOutcome === "pending" ? "pending" : "applied";
  return { status, comments: status, artifact: await dtoFor(record.id, input.requesterId) };
}

async function openRequest(requestId: string) {
  const [request] = await getDb()
    .select()
    .from(sharingRequest)
    .where(and(eq(sharingRequest.id, requestId), eq(sharingRequest.status, "pending")))
    .limit(1);
  if (!request) throw new UserFacingError("This request is no longer open.");
  return request;
}

async function approve(request: typeof sharingRequest.$inferSelect, deciderId: string) {
  const [target] = await getDb().select({ userId: artifact.userId }).from(artifact).where(eq(artifact.id, request.artifactId)).limit(1);
  if (!target || !(await requestStillHolds(request, target.userId))) {
    await cancelPending(request.artifactId, deciderId);
    throw new UserFacingError("The author is no longer in the team, so the request was canceled.");
  }
  // One statement: the request is approved only if it was still open, and the artifact changes with it.
  await getDb().execute(sql`
    with decided as (
      update ${sharingRequest} set status = 'approved', decided_by = ${deciderId}, decided_at = now()
      where id = ${request.id} and status = 'pending'
      returning artifact_id, team_id, visibility, requested_by, comments
    )
    update ${artifact} set visibility = decided.visibility, team_id = decided.team_id, comments = coalesce(decided.comments, ${artifact.comments}),
      show_in_search = ${artifact.showInSearch} and decided.visibility = 'public'
    from decided
    where ${artifact.id} = decided.artifact_id and ${artifact.userId} = ${target.userId}
  `);
  await rehomeProjectQuietly(request.artifactId);
  await cancelPendingComments(request.artifactId, deciderId);
  await syncApprovedVersion(request.artifactId, deciderId);
}

/**
 * Approves or denies an open sharing or edit request. Only owners and admins
 * of the request's team, in the web app.
 */
export async function decideSharingRequest(input: { deciderId: string; requestId: string; approve: boolean }) {
  const request = await openRequest(input.requestId);
  const membership = await getTeamMembershipById(input.deciderId, request.teamId);
  if (!canDecideRequest({ viewerRole: membership?.role ?? null, actor: "person" })) {
    throw new UserFacingError("Only team owners and admins can approve sharing.");
  }
  await applyDecision(request, input);
  // Reads the stored outcome, so a request canceled instead of approved notifies nobody.
  notifySharingDecision(request.id);
}

async function applyDecision(request: typeof sharingRequest.$inferSelect, input: { deciderId: string; approve: boolean }) {
  if (request.kind === "edit") {
    await decideEditRequest(request, input.deciderId, input.approve);
    return;
  }
  if (request.kind === "comments" && input.approve) {
    await approveCommentsRequest(request, input.deciderId);
    return;
  }
  if (input.approve) {
    await approve(request, input.deciderId);
    return;
  }
  await getDb()
    .update(sharingRequest)
    .set({ status: "denied", decidedBy: input.deciderId, decidedAt: new Date() })
    .where(and(eq(sharingRequest.id, request.id), eq(sharingRequest.status, "pending")));
}

/** Makes an artifact private again. The author, or an owner or admin of its team, may do this at any time. */
export async function withdrawArtifactSharing(input: { viewerId: string; artifactId: string }) {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, input.artifactId)).limit(1);
  if (!record) throw new UserFacingError("Artifact not found.");
  const membership = record.teamId ? await getTeamMembershipById(input.viewerId, record.teamId) : null;
  if (!canWithdrawSharing({ viewerId: input.viewerId, authorId: record.userId, viewerRole: membership?.role ?? null })) {
    throw new UserFacingError("Artifact not found.");
  }
  await cancelPending(record.id, input.viewerId);
  await cancelPendingComments(record.id, input.viewerId);
  await setVisibility(record.id, "private", null, input.viewerId);
}
