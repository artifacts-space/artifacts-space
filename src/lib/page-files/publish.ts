import { randomUUID } from "node:crypto";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactFileRecord, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { EditConflictError } from "@/lib/edits/conflict-error";
import { lastSavedBy } from "@/lib/edits/agent-write-guard";
import type { BaseVersion } from "@/lib/edits/edit-conflict-rules";
import { imageFileIdsOf } from "@/lib/files/icon-cleanup-rules";
import { afterSwap } from "@/lib/files/replace";
import { deleteStoredObjects, getFileRows, picturedFileIds } from "@/lib/files/store";
import { finalizeUpload } from "@/lib/files/uploads";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import type { SharingActor } from "@/lib/sharing/rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { planVersionedChangeApproval, prepareVersionedChange, type EditStatus } from "@/lib/versions/service";

import { faultsMessage, inBatches, pageBatchLimits, planPagePublish, type HeldPageFile, type PageFileFault, type PagePublishPlan } from "./publish-rules";
import { isPublishRefusal, runPagePublish, type PublishedRows } from "./publish-statement";

/**
 * Publishing page files: one call brings the page files of an HTML
 * artifact to a new state. The editor's uploads at new paths are added,
 * those at paths the page already has take those files' place (the old
 * content stays in History as an old copy, as with a single replace), and
 * the named paths are removed. It all lands in one statement with one
 * version (publish-statement.ts), or nothing changes. Callers check that
 * the editor may edit the artifact (getEditableArtifact).
 */

/** What to publish: the artifact, the editor's uploads, the paths to remove, and the save the agent read. */
export interface PagePublishRequest {
  artifactId: string;
  /** Ids of the editor's own uploads that were requested as page files; unfinished ones are checked and finished first. */
  uploadIds: readonly string[];
  /** Paths of held page files to remove, letter for letter. */
  remove: readonly string[];
  /** With it, the publish lands only while the artifact is still at this save. */
  base?: BaseVersion | undefined;
}

/** What a publish did. */
export interface PublishedPage {
  /** The artifact's save time this publish stamped, and the version it filed. */
  savedAt: Date;
  versionId: string;
  /** "pending" when the change waits for a team owner's or admin's approval. */
  status: EditStatus;
  added: string[];
  replaced: string[];
  removed: string[];
}

/** An upload that was requested as a page file. */
type PageUploadRow = ArtifactFileRecord & { pagePath: string };

const unusableUploads =
  "These upload ids are unknown, already in an artifact, not yours, or were not requested as page files: ";

/** The editor's own uploads in no artifact that were requested as page files, in the order named. Throws, naming the ids, when one is anything else. */
async function ownPageUploads(editorId: string, uploadIds: readonly string[]): Promise<PageUploadRow[]> {
  const ids = [...new Set(uploadIds.map((id) => id.toLowerCase()))];
  const rows = new Map((await getFileRows(ids)).map((row) => [row.id, row]));
  const usable = (row: ArtifactFileRecord | undefined): row is PageUploadRow => row?.uploaderId === editorId && row.artifactId === null && row.pagePath !== null;
  const unusable = ids.filter((id) => !usable(rows.get(id)));
  if (unusable.length > 0) throw new UserFacingError(`${unusableUploads}${unusable.join(", ")}. Request them with page_files_request_uploads and use the ids you get back.`);
  return ids.flatMap((id) => {
    const row = rows.get(id);
    return usable(row) ? [row] : [];
  });
}

/**
 * Finishes the uploads that are not finished yet: each stored object is
 * checked for its size, type, and first bytes (finalizeUpload), a few at a
 * time. Every upload at fault is reported, not only the first.
 */
async function finishUploads(editorId: string, uploads: readonly PageUploadRow[]): Promise<PageFileFault[]> {
  const pending = uploads.filter((upload) => upload.status !== "ready");
  const faults = await inBatches(pending, pageBatchLimits.checksAtOnce, async (upload): Promise<PageFileFault | null> => {
    try {
      await finalizeUpload(editorId, upload.id);
      return null;
    } catch (error) {
      if (error instanceof UserFacingError) return { path: upload.pagePath, problem: error.message };
      throw error;
    }
  });
  return faults.filter((fault): fault is PageFileFault => fault !== null);
}

/** The page files an artifact holds: each one's id, path, and size. */
export async function heldPageFiles(artifactId: string): Promise<HeldPageFile[]> {
  const rows = await getDb()
    .select({ id: artifactFile.id, pagePath: artifactFile.pagePath, size: artifactFile.size })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
  return rows.flatMap((row) => (row.pagePath === null ? [] : [{ id: row.id, pagePath: row.pagePath, size: row.size }]));
}

/**
 * The held files a publish may not replace or remove: images the artifact
 * or a version in its history shows as its icon or cover. Those change in
 * their picker, as for any file (src/lib/files/replace.ts).
 */
async function picturedFaults(before: ArtifactRecord, changing: readonly HeldPageFile[]): Promise<PageFileFault[]> {
  if (changing.length === 0) return [];
  const pictured = new Set([...imageFileIdsOf(before), ...((await picturedFileIds([before.id])).get(before.id) ?? [])]);
  return changing
    .filter((file) => pictured.has(file.id))
    .map((file) => ({ path: file.pagePath, problem: "This image is the artifact's icon or cover, now or in an earlier version. Change the icon or cover first, or leave this file as it is." }));
}

/** How many times a publish is planned again when other saves keep moving the artifact on. */
const MAX_PLANS = 3;

interface Planned {
  before: ArtifactRecord;
  plan: PagePublishPlan;
}

async function currentArtifact(artifactId: string): Promise<ArtifactRecord> {
  const [row] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!row) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return row;
}

/**
 * Reads the artifact and plans the publish against the page files it holds
 * now. Throws the one refusal that names every file at fault. The artifact
 * is read first, so a change to its files after that moves its save time
 * on, and the statement, which runs only at this save, refuses.
 */
async function planPublish(request: PagePublishRequest, uploads: readonly PageUploadRow[]): Promise<Planned> {
  const before = await currentArtifact(request.artifactId);
  if (before.kind !== "html") throw new UserFacingError('Page files belong to an HTML artifact (kind "html"). This artifact is another format.');
  if (request.base && request.base.updatedAt.getTime() !== before.updatedAt.getTime()) throw new EditConflictError("changed", await lastSavedBy(before.id));
  const held = await heldPageFiles(before.id);
  const check = planPagePublish(uploads.map((upload) => ({ path: upload.pagePath, size: upload.size })), request.remove, held);
  if (!check.ok) throw new UserFacingError(faultsMessage("Nothing was published. Fix these, then publish again:", check.faults));
  const pictured = await picturedFaults(before, [...check.plan.removes, ...check.plan.replaces.map((pair) => pair.held)]);
  if (pictured.length > 0) throw new UserFacingError(faultsMessage("Nothing was published. Fix these, then publish again:", pictured));
  return { before, plan: check.plan };
}

interface Attempt {
  editorId: string;
  actor: SharingActor;
  harness: HarnessStamp | null;
  versionId: string;
  uploads: readonly PageUploadRow[];
}

/** Runs the statement for one plan. Null when the artifact moved on since the plan read it. */
async function landPlan({ before, plan }: Planned, attempt: Attempt): Promise<{ rows: PublishedRows; status: EditStatus } | null> {
  const approvedId = await prepareVersionedChange(before);
  const approval = await planVersionedChangeApproval(before, approvedId, attempt.editorId, attempt.actor);
  const uploadAt = new Map(attempt.uploads.map((upload) => [upload.pagePath, upload.id]));
  const idOf = (path: string) => uploadAt.get(path) ?? "";
  try {
    const rows = await runPagePublish({
      before,
      approval,
      editorId: attempt.editorId,
      actor: attempt.actor,
      harness: attempt.harness,
      versionId: attempt.versionId,
      addIds: plan.adds.map((file) => idOf(file.path)),
      replaces: plan.replaces.map((pair) => ({ entryId: pair.held.id, uploadId: idOf(pair.file.path) })),
      removeIds: plan.removes.map((file) => file.id),
    });
    return rows ? { rows, status: approval.outcome === "pending" ? "pending" : "applied" } : null;
  } catch (error) {
    if (isPublishRefusal(error)) throw new UserFacingError("The page's files or these uploads changed while they were being published, so nothing was changed. Read the artifact and publish again.");
    throw error;
  }
}

/** After a publish landed: the removed files' objects go, then the same housekeeping as after a replace. Nothing here can undo the publish. */
async function afterPublish(artifactId: string, rows: PublishedRows): Promise<void> {
  await deleteStoredObjects(rows.removedKeys.map((key) => ({ key }))).catch((error: unknown) => {
    console.error("[page-files] Removed page files' objects could not be deleted", error instanceof Error ? error.name : "unknown error");
  });
  await afterSwap(artifactId, rows.openedRequestId);
}

/**
 * Publishes page files to an HTML artifact the editor may edit, and files
 * one version for the whole change. Uploads still unfinished are finished
 * first; when any upload is at fault, or the set does not fit the page,
 * one refusal names every file and nothing is changed (an upload that
 * failed its check is removed, as always; the others stay, ready to
 * publish). With `base`, it lands only while the artifact is still at that
 * save (EditConflictError otherwise); without, a save that lands in
 * between has the publish planned again on the new state. For a link or
 * public artifact the version goes through edit review, and readers
 * outside the team keep the files of the approved version until then.
 * Counts once against the per-editor edit limit, whether it lands or is
 * refused.
 */
export async function publishPageFiles(editorId: string, request: PagePublishRequest, actor: SharingActor, harness: () => Promise<HarnessStamp | null> = () => Promise.resolve(null)): Promise<PublishedPage> {
  if (request.uploadIds.length === 0 && request.remove.length === 0) throw new UserFacingError("Name at least one upload to publish or one path to remove.");
  const named = await ownPageUploads(editorId, request.uploadIds);
  // Counted before the uploads are checked in file storage, so a publish that is refused over and over still meets the limit.
  await enforceRateLimit("artifactUpdate", editorId);
  const faults = await finishUploads(editorId, named);
  if (faults.length > 0) throw new UserFacingError(faultsMessage("Nothing was published. These uploads cannot be used:", faults));
  let planned = await planPublish(request, named);
  const attempt = { editorId, actor, harness: await harness(), versionId: randomUUID(), uploads: named };
  for (let tries = 1; ; tries += 1) {
    const landed = await landPlan(planned, attempt);
    if (landed) {
      await afterPublish(request.artifactId, landed.rows);
      const { plan } = planned;
      return { savedAt: landed.rows.savedAt, versionId: attempt.versionId, status: landed.status, added: plan.adds.map((file) => file.path), replaced: plan.replaces.map((pair) => pair.file.path), removed: plan.removes.map((file) => file.pagePath) };
    }
    if (tries >= MAX_PLANS) throw new UserFacingError("The artifact kept changing while its page files were being published, so nothing was changed. Try again.");
    // The artifact moved on since the plan read it. With a base that is a conflict (planPublish throws it); without, the plan is made again.
    planned = await planPublish(request, named);
  }
}
