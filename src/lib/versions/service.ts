import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, team, type ArtifactRecord, type ArtifactVersionRecord, type SharingRequestRecord } from "@/db/schema";
import { canEditRecord } from "@/lib/access";
import type { VersionSaveKind } from "@/lib/artifact-types";
import { isUniqueViolation } from "@/lib/db-errors";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import { notifySharingRequest } from "@/lib/notifications/create";
import type { SharingActor } from "@/lib/sharing/rules";
import { getTeamMembershipById } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { forgetArtifactCache } from "./cache";
import { dropSupersededSessionVersion, ensureHistoryStart, fileVersion, latestVersion, pruneArtifactVersions, versionMatching } from "./history";
import type { EditSessionStep } from "./history-rules";
import { decideEdit, editNeedsAuditRow, isReviewedLevel, sameReviewedFields } from "./rules";

/**
 * Version history and edit re-approval. Every save of any artifact calls
 * recordArtifactSave, which files a version (history.ts). Link and public
 * artifacts also point at an approved version; readers outside the team see
 * it while newer edits wait. Every visibility change calls syncApprovedVersion.
 */

/** What happened to an edit: live for every reader, or waiting for approval. */
export type EditStatus = "applied" | "pending";

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
  forgetArtifactCache(artifactId);
}

/**
 * Makes sure a link or public artifact that has never had an approved
 * version gets one from what it showed before the edit, so readers outside
 * the team never see an unapproved edit.
 */
async function ensureApprovedBefore(before: ArtifactRecord) {
  if (before.approvedVersionId) return before.approvedVersionId;
  const versionId = await versionMatching(before, before.updatedBy ?? before.userId);
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

/**
 * Opens an edit request for `versionId`, or points the open one at it. The
 * version it pointed at before stays in the history.
 */
async function storePendingEdit(record: ArtifactRecord, teamId: string, editorId: string, versionId: string) {
  const visibility = record.visibility === "public" ? "public" : "link";
  const open = and(eq(sharingRequest.artifactId, record.id), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending"));
  const [previous] = await getDb().select({ id: sharingRequest.id }).from(sharingRequest).where(open).limit(1);
  if (previous) {
    await getDb().update(sharingRequest).set({ versionId, teamId, visibility, requestedBy: editorId, createdAt: new Date() }).where(open);
    return;
  }
  const id = randomUUID();
  try {
    await getDb().insert(sharingRequest).values({ id, kind: "edit", artifactId: record.id, teamId, requestedBy: editorId, visibility, versionId });
    // Only a new request notifies; later edits move the open one along quietly.
    notifySharingRequest(id);
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

/** Makes `versionId` live for readers outside the team, or files it for approval. */
async function applyApprovalRule(record: ArtifactRecord, versionId: string, editorId: string, actor: SharingActor): Promise<EditStatus> {
  const { rule, outcome } = await decideFor(record, editorId, actor);
  if (outcome === "pending" && record.teamId) {
    await storePendingEdit(record, record.teamId, editorId, versionId);
    return "pending";
  }
  await setApprovedVersion(record.id, versionId);
  await cancelPendingEdits(record.id, editorId);
  if (record.teamId && editNeedsAuditRow({ visibility: record.visibility, team: rule })) await auditOwnApproval(record, record.teamId, editorId, versionId);
  return "applied";
}

/** What one save was, for recordArtifactSave. */
export interface ArtifactSave {
  /** The row before the save, or null when the artifact was just created. */
  before: ArtifactRecord | null;
  /** The saved row. */
  after: ArtifactRecord;
  editorId: string;
  actor: SharingActor;
  saveKind: VersionSaveKind;
  /** For a restore: the version brought back. */
  restoredFromId?: string | null;
  /** For a web editor autosave: where it sits in its editing session (one version per session). */
  session?: EditSessionStep | undefined;
  /** For a save over MCP: the agent harness the version records. Undefined for saves in the web app. */
  harness?: HarnessStamp | null | undefined;
}

/**
 * Files a save in the artifact's history and applies the approval rule.
 * Private and team artifacts always apply. For link and public artifacts the
 * saved version becomes the approved one, or waits for an owner or admin; a
 * save that brings back exactly the approved version cancels the wait.
 * Old versions are pruned afterwards.
 */
export async function recordArtifactSave(save: ArtifactSave): Promise<EditStatus> {
  const { before, after, editorId } = save;
  if (before) await ensureHistoryStart(before);
  const approvedId = before && isReviewedLevel(after.visibility) ? await ensureApprovedBefore(before) : null;
  // A continuing session that could not merge (its version was approved or waiting) replaces that version once approval moved on.
  const previous = save.session === "continue" ? await latestVersion(after.id) : null;
  const versionId = await fileVersion({ ...after, approvedVersionId: approvedId ?? after.approvedVersionId }, { editorId, saveKind: save.saveKind, restoredFromId: save.restoredFromId ?? null, session: save.session, harness: save.harness });
  const status = approvedId ? await approvalFor(after, approvedId, versionId, save) : "applied";
  await dropSupersededSessionVersion(after, previous, { editorId, saveKind: save.saveKind, session: save.session, newVersionId: versionId }).catch((error: unknown) => {
    // Housekeeping only: an extra version in History is the worst case.
    console.error("[versions] Dropping a superseded session version failed", error instanceof Error ? error.name : "unknown error");
  });
  await pruneArtifactVersions(after.id).catch((error: unknown) => {
    // Pruning is housekeeping; the cleanup job retries it.
    console.error("[versions] Pruning after a save failed", error instanceof Error ? error.name : "unknown error");
  });
  return status;
}

async function approvalFor(after: ArtifactRecord, approvedId: string, versionId: string, save: ArtifactSave): Promise<EditStatus> {
  const approved = await getArtifactVersion(approvedId);
  if (save.saveKind !== "files" && approved && sameReviewedFields(approved, after)) {
    await cancelPendingEdits(after.id, save.editorId);
    return "applied";
  }
  return applyApprovalRule({ ...after, approvedVersionId: approvedId }, versionId, save.editorId, save.actor);
}

/**
 * Records a change the artifact row does not show, such as attached or
 * removed files: it marks who saved it, files a version, and runs the
 * approval rule. Readers outside the team of a link or public artifact keep
 * the approved version (and its files) until the change is approved. Call it
 * after the change is saved.
 */
export async function recordArtifactChange(input: { artifactId: string; editorId: string; actor: SharingActor }): Promise<EditStatus> {
  const [before] = await getDb().select().from(artifact).where(eq(artifact.id, input.artifactId)).limit(1);
  if (!before) return "applied";
  const [after] = await getDb()
    .update(artifact)
    .set({ updatedBy: input.editorId, updatedAt: new Date() })
    .where(eq(artifact.id, input.artifactId))
    .returning();
  if (!after) return "applied";
  return recordArtifactSave({ before, after, editorId: input.editorId, actor: input.actor, saveKind: "files" });
}

/**
 * Call after any visibility change. A link or public artifact gets its
 * current content as the approved version when it has none. Team and
 * private artifacts drop the approved version and any open edit request;
 * the versions stay in the history.
 */
export async function syncApprovedVersion(artifactId: string, byUserId: string) {
  forgetArtifactCache(artifactId);
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) return;
  if (isReviewedLevel(record.visibility)) {
    if (record.approvedVersionId) return;
    const versionId = await versionMatching(record, byUserId);
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
 * approved version live and leaves the draft in the history. A request whose
 * editor may no longer edit the artifact is canceled instead.
 */
export async function decideEditRequest(request: SharingRequestRecord, deciderId: string, approve: boolean) {
  if (!approve) {
    await getDb()
      .update(sharingRequest)
      .set({ status: "denied", decidedBy: deciderId, decidedAt: new Date() })
      .where(and(eq(sharingRequest.id, request.id), eq(sharingRequest.status, "pending")));
    return;
  }
  const [target] = await getDb().select().from(artifact).where(eq(artifact.id, request.artifactId)).limit(1);
  if (!target || !(await canEditRecord(request.requestedBy, target))) {
    await cancelPendingEdits(request.artifactId, deciderId);
    throw new UserFacingError("The person who made this edit can no longer edit the artifact, so the request was canceled.");
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
  forgetArtifactCache(request.artifactId);
}
