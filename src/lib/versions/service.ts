import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, team, type ArtifactRecord, type ArtifactVersionRecord, type SharingRequestRecord } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import type { SharingActor } from "@/lib/sharing/rules";
import { getTeamMembershipById } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { decideEdit, editNeedsAuditRow, isReviewedLevel, sameReviewedFields } from "./rules";

/**
 * Edit re-approval storage. Link and public artifacts point at an approved
 * version; readers outside the team see it while newer edits wait. Every
 * write that changes such an artifact calls recordArtifactEdit, and every
 * visibility change calls syncApprovedVersion.
 */

/** What happened to an edit: live for every reader, or waiting for approval. */
export type EditStatus = "applied" | "pending";

/** Saves what readers see of the artifact now as a new version and returns its id. */
export async function snapshotArtifact(record: ArtifactRecord, createdBy: string | null): Promise<string> {
  const id = randomUUID();
  await getDb().insert(artifactVersion).values({
    id,
    artifactId: record.id,
    title: record.title,
    summary: record.summary,
    content: record.content,
    kind: record.kind,
    language: record.language,
    project: record.project,
    source: record.source,
    metadata: record.metadata,
    createdBy,
  });
  return id;
}

/** One version by id, or null. */
export async function getArtifactVersion(id: string): Promise<ArtifactVersionRecord | null> {
  const [row] = await getDb().select().from(artifactVersion).where(eq(artifactVersion.id, id)).limit(1);
  return row ?? null;
}

async function cancelPendingEdits(artifactId: string, byUserId: string | null) {
  await getDb()
    .update(sharingRequest)
    .set({ status: "canceled", decidedBy: byUserId, decidedAt: new Date() })
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")));
}

async function setApprovedVersion(artifactId: string, versionId: string | null) {
  await getDb().update(artifact).set({ approvedVersionId: versionId }).where(eq(artifact.id, artifactId));
}

/**
 * Makes sure a link or public artifact that has never had an approved
 * version gets one from what it showed before the edit, so readers outside
 * the team never see an unapproved edit.
 */
async function ensureApprovedBefore(before: ArtifactRecord, editorId: string) {
  if (before.approvedVersionId) return before.approvedVersionId;
  const versionId = await snapshotArtifact(before, before.userId === editorId ? editorId : null);
  await getDb().update(artifact).set({ approvedVersionId: versionId }).where(and(eq(artifact.id, before.id), isNull(artifact.approvedVersionId)));
  return versionId;
}

async function loadTeamRule(teamId: string | null) {
  if (!teamId) return null;
  const [row] = await getDb()
    .select({ personal: team.personal, teamSharingNeedsApproval: team.teamSharingNeedsApproval })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);
  return row ?? null;
}

async function storePendingEdit(record: ArtifactRecord, teamId: string, editorId: string, versionId: string) {
  const visibility = record.visibility === "public" ? "public" : "link";
  const open = and(eq(sharingRequest.artifactId, record.id), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending"));
  const [previous] = await getDb().select({ versionId: sharingRequest.versionId }).from(sharingRequest).where(open).limit(1);
  if (previous) {
    await getDb().update(sharingRequest).set({ versionId, teamId, visibility, requestedBy: editorId, createdAt: new Date() }).where(open);
    // The superseded draft was never approved, so nothing points at it any more.
    if (previous.versionId && previous.versionId !== versionId && previous.versionId !== record.approvedVersionId) {
      await getDb().delete(artifactVersion).where(eq(artifactVersion.id, previous.versionId));
    }
    return;
  }
  try {
    await getDb().insert(sharingRequest).values({ id: randomUUID(), kind: "edit", artifactId: record.id, teamId, requestedBy: editorId, visibility, versionId });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another edit filed the request first; point it at this newer version.
    await getDb().update(sharingRequest).set({ versionId, requestedBy: editorId, createdAt: new Date() }).where(open);
  }
}

async function auditOwnApproval(record: ArtifactRecord, teamId: string, editorId: string, versionId: string) {
  const visibility = record.visibility === "public" ? "public" : "link";
  await getDb().insert(sharingRequest).values({
    id: randomUUID(),
    kind: "edit",
    artifactId: record.id,
    teamId,
    requestedBy: editorId,
    visibility,
    versionId,
    status: "approved",
    decidedBy: editorId,
    decidedAt: new Date(),
  });
}

async function decideFor(record: ArtifactRecord, editorId: string, actor: SharingActor) {
  const [rule, membership] = await Promise.all([loadTeamRule(record.teamId), record.teamId ? getTeamMembershipById(editorId, record.teamId) : null]);
  const outcome = decideEdit({ visibility: record.visibility, team: rule, role: membership?.role ?? null, actor });
  return { rule, outcome };
}

/**
 * Applies the approval rule after an artifact changed. `before` is the row
 * before the edit and `after` the saved row. Team and private artifacts are
 * always applied. For link and public artifacts the edit becomes the approved
 * version, or a pending edit request waits for an owner or admin.
 */
export async function recordArtifactEdit(input: { before: ArtifactRecord; after: ArtifactRecord; editorId: string; actor: SharingActor }): Promise<EditStatus> {
  const { after, editorId } = input;
  if (!isReviewedLevel(after.visibility)) return "applied";
  const approvedId = await ensureApprovedBefore(input.before, editorId);
  const approved = await getArtifactVersion(approvedId);
  if (approved && sameReviewedFields(approved, after)) {
    await cancelPendingEdits(after.id, editorId);
    return "applied";
  }

  return fileVersion(after, approvedId, editorId, input.actor);
}

/** Saves `record` as a new version and makes it live, or files it for approval. */
async function fileVersion(record: ArtifactRecord, approvedId: string, editorId: string, actor: SharingActor): Promise<EditStatus> {
  const { rule, outcome } = await decideFor(record, editorId, actor);
  const versionId = await snapshotArtifact(record, editorId);
  if (outcome === "pending" && record.teamId) {
    await storePendingEdit({ ...record, approvedVersionId: approvedId }, record.teamId, editorId, versionId);
    return "pending";
  }

  await setApprovedVersion(record.id, versionId);
  await cancelPendingEdits(record.id, editorId);
  if (record.teamId && editNeedsAuditRow({ visibility: record.visibility, team: rule })) await auditOwnApproval(record, record.teamId, editorId, versionId);
  return "applied";
}

/**
 * Runs the approval rule for a change the artifact row does not show, such
 * as attached files, and always files a new version. For link and public
 * artifacts the change goes live now or waits like any edit; readers outside
 * the team keep the approved version (and its time, `view.updatedAt`) until
 * then. Call it after the change is saved.
 */
export async function recordArtifactChange(input: { artifactId: string; editorId: string; actor: SharingActor }): Promise<EditStatus> {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, input.artifactId)).limit(1);
  if (!record || !isReviewedLevel(record.visibility)) return "applied";
  const approvedId = await ensureApprovedBefore(record, input.editorId);
  return fileVersion(record, approvedId, input.editorId, input.actor);
}

/**
 * Call after any visibility change. A link or public artifact gets its
 * current content as the approved version when it has none. Team and
 * private artifacts drop the approved version and any open edit request.
 */
export async function syncApprovedVersion(artifactId: string, byUserId: string) {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) return;
  if (isReviewedLevel(record.visibility)) {
    if (record.approvedVersionId) return;
    const versionId = await snapshotArtifact(record, byUserId);
    await getDb().update(artifact).set({ approvedVersionId: versionId }).where(and(eq(artifact.id, artifactId), isNull(artifact.approvedVersionId)));
    return;
  }
  if (record.approvedVersionId) await setApprovedVersion(artifactId, null);
  await cancelPendingEdits(artifactId, byUserId);
}

/**
 * Approves or denies an open edit request. The caller checks that the
 * decider is an owner or admin of the request's team. Approval makes the
 * request's version the one readers outside the team see; denial keeps the
 * approved version live and leaves the draft with the author.
 */
export async function decideEditRequest(request: SharingRequestRecord, deciderId: string, approve: boolean) {
  if (!approve) {
    await getDb()
      .update(sharingRequest)
      .set({ status: "denied", decidedBy: deciderId, decidedAt: new Date() })
      .where(and(eq(sharingRequest.id, request.id), eq(sharingRequest.status, "pending")));
    return;
  }
  const [target] = await getDb().select({ userId: artifact.userId }).from(artifact).where(eq(artifact.id, request.artifactId)).limit(1);
  if (target?.userId !== request.requestedBy) {
    await cancelPendingEdits(request.artifactId, deciderId);
    throw new UserFacingError("The artifact changed hands, so the edit request was canceled.");
  }
  // One statement: the version goes live only if the request was still open and the artifact is still link or public.
  await getDb().execute(sql`
    with decided as (
      update ${sharingRequest} set status = 'approved', decided_by = ${deciderId}, decided_at = now()
      where id = ${request.id} and status = 'pending' and kind = 'edit'
      returning artifact_id, version_id
    )
    update ${artifact} set approved_version_id = decided.version_id
    from decided
    where ${artifact.id} = decided.artifact_id and ${artifact.visibility} in ('link', 'public') and decided.version_id is not null
  `);
}
