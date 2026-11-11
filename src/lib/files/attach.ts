import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, artifactFile } from "@/db/schema";
import { canEditRecord } from "@/lib/access";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import type { SharingActor } from "@/lib/sharing/rules";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { UserFacingError } from "@/lib/user-facing-error";
import { recordArtifactChange } from "@/lib/versions/service";

import { canUseFileInArtifact } from "./access-rules";
import { fileLimits } from "./config";
import { countHistoryOnlyFiles } from "./icon-cleanup";
import { unusableFilesForPeople } from "./person-messages";
import { fileRefsInContent, maxFileRefs } from "./refs";
import { removeCopiesOf } from "./copies";
import { attachFileRows, clearIconForFile, countArtifactFiles, deleteFileRows, getFileRow, getFileRows, removeUnattachedUpload, usableFileRows } from "./store";

/**
 * Putting files into artifacts. A file belongs to one artifact. An editor
 * (the author, or a member of the team the artifact is shared through) may
 * use their own finished, unattached uploads, and files already in the
 * artifact; nothing else, so no one can pull another person's file into view.
 * Callers check that the editor may edit the artifact (getEditableArtifact).
 */

/** Throws a UserFacingError, naming the ids for agents, unless every file is usable in this artifact. */
export async function assertUsableFiles(authorId: string, artifactId: string | null, fileIds: readonly string[]): Promise<void> {
  if (fileIds.length === 0) return;
  if (fileIds.length > maxFileRefs) throw new UserFacingError(`An artifact can use at most ${String(maxFileRefs)} files.`);
  const rows = new Map((await getFileRows(fileIds)).map((row) => [row.id, row]));
  const unusable = fileIds.filter((id) => {
    const row = rows.get(id);
    return !row || !canUseFileInArtifact(row, authorId, artifactId);
  });
  if (unusable.length > 0) {
    throw new UserFacingError(
      `These file ids are unknown, still uploading, or not yours to use here: ${unusable.join(", ")}. Upload each file (files_request_upload, PUT, files_finalize) and use the id you get back. A file belongs to one artifact.`,
      unusableFilesForPeople,
    );
  }
  const adding = fileIds.filter((id) => rows.get(id)?.artifactId === null).length;
  if (!(await hasRoomFor(artifactId, adding))) {
    throw new UserFacingError(`An artifact holds at most ${String(fileLimits.maxFilesPerArtifact)} files. Remove some first.`);
  }
}

/** Whether the artifact (null on create) can take `adding` more files. Old icon and cover images, and removed media, kept only for Restore do not count (see countHistoryOnlyFiles). */
async function hasRoomFor(artifactId: string | null, adding: number): Promise<boolean> {
  if (!artifactId) return adding <= fileLimits.maxFilesPerArtifact;
  const existing = await countArtifactFiles(artifactId);
  if (existing + adding <= fileLimits.maxFilesPerArtifact) return true;
  return existing - (await countHistoryOnlyFiles(artifactId)) + adding <= fileLimits.maxFilesPerArtifact;
}

/** No harness: a change in the web app. An agent passes its harness, looked up only when the change files a version. */
const noStamp = () => Promise.resolve(null);

/**
 * Attaches the editor's files to an artifact they may edit, and files a
 * version. For a link or public artifact the change goes through edit review
 * (recordArtifactChange), so readers outside the team see new files only
 * once they are approved. Counts against the per-editor edit limit.
 */
export async function attachFiles(editorId: string, artifactId: string, fileIds: readonly string[], actor: SharingActor, harness: () => Promise<HarnessStamp | null> = noStamp): Promise<void> {
  await assertUsableFiles(editorId, artifactId, fileIds);
  await enforceRateLimit("artifactUpdate", editorId);
  const attached = await attachFileRows(editorId, artifactId, fileIds);
  if (attached > 0) await recordArtifactChange({ artifactId, editorId, actor, harness: await harness() });
}

/**
 * The files a save points at, checked before anything is written. Returns
 * the ids to attach once the artifact exists, as content media
 * (`attachFileRows(…, { byContent: true })`). `artifactId` is null on create.
 */
export async function checkContentFiles(authorId: string, artifactId: string | null, kind: string, content: string): Promise<string[]> {
  const ids = fileRefsInContent(kind, content);
  if (kind === "markdown") return attachableMarkdownFiles(authorId, artifactId, ids);
  await assertUsableFiles(authorId, artifactId, ids);
  return ids;
}

/**
 * The files a Markdown save attaches: the editor's own finished uploads and
 * files already in this artifact. Markdown may also link files it cannot
 * use (another artifact's, a deleted one, or text from a restored version);
 * those stay plain links that load only for people who can read the file,
 * so a save or a Restore never fails over them and never widens access.
 * The lookup reads the files the author may use (usableFileRows), not the
 * linked ids, and the file cap applies to the usable ones, so any number of
 * links never fails a save and the author's own uploads are always found.
 */
async function attachableMarkdownFiles(authorId: string, artifactId: string | null, fileIds: readonly string[]): Promise<string[]> {
  if (fileIds.length === 0) return [];
  const named = new Set(fileIds);
  const usable = (await usableFileRows(authorId, artifactId)).filter((row) => named.has(row.id) && canUseFileInArtifact(row, authorId, artifactId));
  if (usable.length > maxFileRefs) throw new UserFacingError(`An artifact can use at most ${String(maxFileRefs)} files.`);
  const adding = usable.filter((row) => row.artifactId === null).length;
  if (adding > 0 && !(await hasRoomFor(artifactId, adding))) {
    throw new UserFacingError(`An artifact holds at most ${String(fileLimits.maxFilesPerArtifact)} files. Remove some first.`);
  }
  return usable.map((row) => row.id);
}

async function mayEditArtifact(userId: string, artifactId: string) {
  const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  return record ? canEditRecord(userId, record) : false;
}

/**
 * Deletes one file row and then the object it held at that moment, so a
 * replace landing meanwhile never leaves its new object behind
 * (deleteFileRows). An upload in no artifact goes only while it still is
 * (removeUnattachedUpload); a file in an artifact goes with its old copies.
 */
async function deleteFileOf(row: { id: string; artifactId: string | null }, userId: string): Promise<boolean> {
  if (row.artifactId === null) return removeUnattachedUpload(row.id, userId);
  await removeCopiesOf([row.id]);
  return (await deleteFileRows(and(eq(artifactFile.id, row.id), eq(artifactFile.artifactId, row.artifactId)))).length > 0;
}

/**
 * Deletes a file from R2 and the database. Allowed for the uploader while it
 * is not attached, and for anyone who may edit the artifact it belongs to.
 * Returns the artifact id it belonged to, or null. An agent passes its
 * harness, looked up only when the deletion files a version.
 */
export async function deleteOwnFile(userId: string, fileId: string, actor: SharingActor, harness: () => Promise<HarnessStamp | null> = noStamp): Promise<string | null> {
  const row = z.uuid().safeParse(fileId).success ? await getFileRow(fileId.toLowerCase()) : null;
  const allowed = row !== null && (row.artifactId === null ? row.uploaderId === userId : await mayEditArtifact(userId, row.artifactId));
  if (!row || !allowed) throw new UserFacingError("File not found.");
  if (!(await deleteFileOf(row, userId))) throw new UserFacingError("The file could not be deleted. Try again.");
  if (row.artifactId) {
    // An icon that showed this image goes back to the format icon, and the change is versioned.
    await clearIconForFile(row.artifactId, row.id);
    await recordArtifactChange({ artifactId: row.artifactId, editorId: userId, actor, harness: await harness() });
  }
  return row.artifactId;
}

/**
 * Deletes the uploader's own upload while it belongs to no artifact; does
 * nothing for a file in an artifact or someone else's. A blank page sends
 * it for uploads that never reached an artifact, so a lost answer can never
 * turn into removing a file from one. The check and the delete are one
 * statement (removeUnattachedUpload).
 */
export async function discardUnattachedUpload(userId: string, fileId: string): Promise<void> {
  await removeUnattachedUpload(fileId.toLowerCase(), userId);
}
