import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { artifact, sharingRequest, type ArtifactRecord } from "@/db/schema";
import { isTeamMember } from "@/lib/access";
import type { ArtifactDto, ArtifactVisibility, SharingLevel } from "@/lib/artifact-types";
import { getOwnArtifact, toArtifactDtos } from "@/lib/artifacts";
import { isUniqueViolation } from "@/lib/db-errors";
import { findPersonalTeam, getTeamMembershipById, type TeamMembership } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";
import { decideEditRequest, syncApprovedVersion } from "@/lib/versions/service";

import {
  canDecideRequest,
  canWithdrawSharing,
  decideSharing,
  isLevelAllowedInTeam,
  sharingNeedsApproval,
  type SharingActor,
} from "./rules";

/**
 * Every sharing change goes through this module. requestArtifactSharing
 * applies a change at once when the team's rule allows it, or stores a
 * pending request and leaves visibility unchanged. Owners and admins decide
 * requests with decideSharingRequest and can withdraw sharing at any time.
 */

export interface SharingRequestInput {
  requesterId: string;
  /** Internal artifact id. Only the author may request sharing. */
  artifactId: string;
  visibility: ArtifactVisibility;
  /** The team to share with (team), or whose admins approve it (link, public). Defaults to the personal team for link and public. */
  teamId?: string | null | undefined;
  actor: SharingActor;
}

export interface SharingResult {
  status: "applied" | "pending";
  artifact: ArtifactDto;
}

async function dtoFor(artifactId: string) {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) throw new UserFacingError("Artifact not found.");
  const [dto] = await toArtifactDtos([record]);
  if (!dto) throw new UserFacingError("Artifact not found.");
  return dto;
}

/** Cancels the open sharing request. Edit requests follow syncApprovedVersion instead. */
async function cancelPending(artifactId: string, byUserId: string) {
  await getDb()
    .update(sharingRequest)
    .set({ status: "canceled", decidedBy: byUserId, decidedAt: new Date() })
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "sharing"), eq(sharingRequest.status, "pending")));
}

async function setVisibility(artifactId: string, visibility: ArtifactVisibility, teamId: string | null, byUserId: string) {
  await getDb().update(artifact).set({ visibility, teamId }).where(eq(artifact.id, artifactId));
  // An open edit request follows the artifact to its new approving team.
  if (teamId) {
    await getDb()
      .update(sharingRequest)
      .set({ teamId })
      .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")));
  }
  await syncApprovedVersion(artifactId, byUserId);
}

async function resolveTeam(requesterId: string, level: SharingLevel, teamId: string | null | undefined): Promise<TeamMembership> {
  if (!teamId && level === "team") throw new UserFacingError("Choose a team to share with.");
  const targetId = teamId ?? (await findPersonalTeam(requesterId))?.id;
  const membership = targetId ? await getTeamMembershipById(requesterId, targetId) : null;
  if (!membership) throw new UserFacingError("Team not found. You can share only with teams you belong to.");
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

async function storeRequest(record: ArtifactRecord, team: TeamMembership, level: SharingLevel, requesterId: string) {
  try {
    await getDb().insert(sharingRequest).values({ id: randomUUID(), artifactId: record.id, teamId: team.id, requestedBy: requesterId, visibility: level });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("A sharing request for this artifact is already waiting.");
    throw error;
  }
}

/**
 * Asks to change who can read an artifact. Making it private always applies.
 * Otherwise the team's rule decides: the change applies now, or a pending
 * request waits for an owner or admin and visibility stays as it is. A new
 * request replaces an older open one.
 */
export async function requestArtifactSharing(input: SharingRequestInput): Promise<SharingResult> {
  const record = await getOwnArtifact(input.requesterId, input.artifactId);
  if (!record) throw new UserFacingError("Artifact not found. Only its author can share it.");

  if (input.visibility === "private") {
    await cancelPending(record.id, input.requesterId);
    await setVisibility(record.id, "private", null, input.requesterId);
    return { status: "applied", artifact: await dtoFor(record.id) };
  }

  await enforceRateLimit("sharingRequest", input.requesterId);
  const level = input.visibility;
  const team = await resolveTeam(input.requesterId, level, input.teamId);
  await cancelPending(record.id, input.requesterId);
  const outcome = decideSharing({ level, team, role: team.role, actor: input.actor });
  if (outcome === "pending") {
    await storeRequest(record, team, level, input.requesterId);
    return { status: "pending", artifact: await dtoFor(record.id) };
  }

  await setVisibility(record.id, level, team.id, input.requesterId);
  // Keep an audit row when an owner or admin approved their own change.
  if (sharingNeedsApproval(level, team)) await recordDecision(record, team, level, input.requesterId);
  return { status: "applied", artifact: await dtoFor(record.id) };
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
  const authorStillHere = target?.userId === request.requestedBy && (await isTeamMember(request.requestedBy, request.teamId));
  if (!authorStillHere) {
    await cancelPending(request.artifactId, deciderId);
    throw new UserFacingError("The author is no longer in the team, so the request was canceled.");
  }
  // One statement: the request is approved only if it was still open, and the artifact changes with it.
  await getDb().execute(sql`
    with decided as (
      update ${sharingRequest} set status = 'approved', decided_by = ${deciderId}, decided_at = now()
      where id = ${request.id} and status = 'pending'
      returning artifact_id, team_id, visibility, requested_by
    )
    update ${artifact} set visibility = decided.visibility, team_id = decided.team_id
    from decided
    where ${artifact.id} = decided.artifact_id and ${artifact.userId} = decided.requested_by
  `);
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
  if (request.kind === "edit") {
    await decideEditRequest(request, input.deciderId, input.approve);
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
  await setVisibility(record.id, "private", null, input.viewerId);
}
