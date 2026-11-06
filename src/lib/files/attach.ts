import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { canUseFileInArtifact } from "./access-rules";
import { fileLimits } from "./config";
import { fileRefsInContent, maxFileRefs } from "./refs";
import { attachFileRows, countArtifactFiles, getFileRow, getFileRows, removeFiles } from "./store";

/**
 * Putting files into artifacts. A file belongs to one artifact. An author
 * may use their own finished, unattached uploads, and files already in the
 * artifact; nothing else, so no one can pull another person's file into view.
 */

/** Throws a UserFacingError, naming the ids, unless every file is usable in this artifact. */
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
    );
  }
  const adding = fileIds.filter((id) => rows.get(id)?.artifactId === null).length;
  const existing = artifactId ? await countArtifactFiles(artifactId) : 0;
  if (existing + adding > fileLimits.maxFilesPerArtifact) {
    throw new UserFacingError(`An artifact holds at most ${String(fileLimits.maxFilesPerArtifact)} files. Remove some first.`);
  }
}

/** Attaches checked files to the author's artifact. Call assertUsableFiles first. */
export async function attachFiles(authorId: string, artifactId: string, fileIds: readonly string[]): Promise<void> {
  await assertUsableFiles(authorId, artifactId, fileIds);
  await attachFileRows(authorId, artifactId, fileIds);
}

/**
 * The files a save points at, checked before anything is written. Returns
 * the ids to attach once the artifact exists. `artifactId` is null on create.
 */
export async function checkContentFiles(authorId: string, artifactId: string | null, kind: string, content: string): Promise<string[]> {
  const ids = fileRefsInContent(kind, content);
  await assertUsableFiles(authorId, artifactId, ids);
  return ids;
}

async function artifactAuthor(artifactId: string) {
  const [row] = await getDb().select({ userId: artifact.userId }).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  return row?.userId ?? null;
}

/**
 * Deletes a file from R2 and the database. Allowed for the uploader while it
 * is not attached, and for the author of the artifact it belongs to. Returns
 * the artifact id it belonged to, or null.
 */
export async function deleteOwnFile(userId: string, fileId: string): Promise<string | null> {
  const row = z.uuid().safeParse(fileId).success ? await getFileRow(fileId.toLowerCase()) : null;
  const allowed = row !== null && (row.artifactId === null ? row.uploaderId === userId : (await artifactAuthor(row.artifactId)) === userId);
  if (!row || !allowed) throw new UserFacingError("File not found.");
  const removed = await removeFiles([row]);
  if (removed.length === 0) throw new UserFacingError("The file could not be deleted. Try again.");
  return row.artifactId;
}
