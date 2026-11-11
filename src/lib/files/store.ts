import { and, asc, eq, getTableColumns, gte, inArray, isNull, like, lt, lte, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, artifactVersion, type ArtifactFileRecord } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";

import { fileLimits } from "./config";
import { cleanupOrphanCopies, removeArtifactCopies, removeCopiesOf } from "./copies";
import { deleteObject, r2ConfigFromEnv } from "./r2";
import type { FileDto } from "./types";

/**
 * File rows in the database, and removing files from R2 with their rows.
 * Callers check who may do what; access-rules.ts holds the rules.
 */

/** Maps a row to the shape the app and agents see. `pictured` comes from listFilesForArtifacts. */
export function toFileDto(row: ArtifactFileRecord, pictured?: boolean): FileDto {
  const dto: FileDto = { id: row.id, filename: row.filename, contentType: row.contentType, size: row.size, createdAt: row.createdAt.toISOString(), replacedAt: row.replacedAt?.toISOString() ?? null, embedded: row.attachedByContent };
  return pictured === undefined ? dto : { ...dto, pictured };
}

/**
 * SQL: whether any version of the file's artifact shows the file as its
 * icon or cover (replace.ts refuses to replace those). The artifact's
 * current icon and cover are in the DTO itself (offersReplace). Only images
 * can be either, so other files skip the version lookup.
 */
function picturedSql(): SQL<boolean> {
  const ref = sql`${FILE_PREFIX}::text || ${artifactFile.id}::text`;
  return sql<boolean>`(${artifactFile.contentType} like 'image/%' and exists (
    select 1 from ${artifactVersion} v
    where v.artifact_id = ${artifactFile.artifactId} and (v.icon = ${ref} or v.cover = ${ref} or v.cover like (${ref} || '@%'))
  ))`;
}

/** One file row by id, or null. */
export async function getFileRow(fileId: string): Promise<ArtifactFileRecord | null> {
  const [row] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId)).limit(1);
  return row ?? null;
}

/** File rows by id. Unknown ids are left out. */
export async function getFileRows(fileIds: readonly string[]): Promise<ArtifactFileRecord[]> {
  if (fileIds.length === 0) return [];
  return getDb().select().from(artifactFile).where(inArray(artifactFile.id, [...fileIds]));
}

/**
 * Ready files of these artifacts, in the order they were attached, by
 * artifact id. With `attachedBy`, only files attached at or before that
 * time: what readers of an approved version may see.
 */
export async function listFilesForArtifacts(artifactIds: readonly string[], options: { attachedBy?: Date | null } = {}): Promise<Map<string, FileDto[]>> {
  const files = new Map<string, FileDto[]>();
  if (artifactIds.length === 0) return files;
  const cutoff = options.attachedBy ? lte(artifactFile.attachedAt, options.attachedBy) : undefined;
  const rows = await getDb()
    .select({ ...getTableColumns(artifactFile), pictured: picturedSql() })
    .from(artifactFile)
    .where(and(inArray(artifactFile.artifactId, [...artifactIds]), eq(artifactFile.status, "ready"), cutoff))
    .orderBy(asc(artifactFile.attachedAt), asc(artifactFile.createdAt));
  for (const { pictured, ...row } of rows) {
    if (!row.artifactId) continue;
    const list = files.get(row.artifactId) ?? [];
    list.push(toFileDto(row, pictured));
    files.set(row.artifactId, list);
  }
  return files;
}

/** Ready files of one artifact, in one query; `attachedBy` as for listFilesForArtifacts. */
export async function listArtifactFiles(artifactId: string, options: { attachedBy?: Date | null } = {}): Promise<FileDto[]> {
  return (await listFilesForArtifacts([artifactId], options)).get(artifactId) ?? [];
}

/** Removes an icon or cover that points at a file being deleted from its artifact. Call before the change is recorded. */
export async function clearIconForFile(artifactId: string, fileId: string): Promise<void> {
  const ref = `${FILE_PREFIX}${fileId}`;
  await getDb().update(artifact).set({ icon: null }).where(and(eq(artifact.id, artifactId), eq(artifact.icon, ref)));
  await getDb().update(artifact).set({ cover: null }).where(and(eq(artifact.id, artifactId), or(eq(artifact.cover, ref), like(artifact.cover, `${ref}@%`))));
}

/** How many files an artifact holds. */
export async function countArtifactFiles(artifactId: string): Promise<number> {
  const [row] = await getDb().select({ count: sql<number>`count(*)::int` }).from(artifactFile).where(eq(artifactFile.artifactId, artifactId));
  return row?.count ?? 0;
}

/** How many uploads a person started within the last hour and has not finished. Older ones are abandoned and wait for cleanup. */
export async function countPendingUploads(uploaderId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - fileLimits.pendingTtlMs);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(artifactFile)
    .where(and(eq(artifactFile.uploaderId, uploaderId), eq(artifactFile.status, "pending"), gte(artifactFile.createdAt, since)));
  return row?.count ?? 0;
}

/**
 * Attaches the uploader's own ready, unattached files to an artifact. Files
 * already attached anywhere are left alone. `byContent` marks them as
 * content media: true only when a content save attaches the uploads its
 * content names (content-files.ts). Returns how many changed.
 */
export async function attachFileRows(uploaderId: string, artifactId: string, fileIds: readonly string[], options: { byContent?: boolean } = {}): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await getDb()
    .update(artifactFile)
    .set({ artifactId, attachedAt: sql`now()`, attachedByContent: options.byContent ?? false })
    .where(and(inArray(artifactFile.id, [...fileIds]), eq(artifactFile.uploaderId, uploaderId), eq(artifactFile.status, "ready"), isNull(artifactFile.artifactId)))
    .returning();
  return rows.length;
}

/**
 * The ready files `authorId` may use in an artifact (null on create): the
 * artifact's own files and the author's unattached uploads. Read without an
 * id list, so a save that links any number of files never sends a huge
 * query and never misses the author's own uploads (canUseFileInArtifact).
 */
export async function usableFileRows(authorId: string, artifactId: string | null): Promise<ArtifactFileRecord[]> {
  const own = and(isNull(artifactFile.artifactId), eq(artifactFile.uploaderId, authorId));
  return getDb()
    .select()
    .from(artifactFile)
    .where(and(eq(artifactFile.status, "ready"), artifactId ? or(eq(artifactFile.artifactId, artifactId), own) : own));
}

/**
 * Deletes the R2 objects of file rows already deleted, for callers that
 * must delete the row first, under a check, in one statement. An object R2
 * refuses to delete is left behind and logged by key; with no row, no one
 * can open it.
 */
export async function deleteStoredObjects(rows: readonly Pick<ArtifactFileRecord, "key">[]): Promise<void> {
  if (rows.length === 0) return;
  const config = r2ConfigFromEnv();
  const results = await Promise.allSettled(rows.map((row) => deleteObject(config, row.key)));
  const failed = rows.filter((_, index) => results[index]?.status === "rejected").map((row) => row.key);
  if (failed.length > 0) console.error(`[files] ${String(failed.length)} R2 objects of deleted files could not be deleted`, failed);
}

/**
 * Deletes files from R2 and then their rows, with the old copies of any
 * that were replaced. A row stays when its object could not be deleted, so
 * the cleanup job tries again; so does a copy. Returns the ids removed.
 */
export async function removeFiles(rows: readonly Pick<ArtifactFileRecord, "id" | "key">[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const config = r2ConfigFromEnv();
  const results = await Promise.allSettled(rows.map((row) => deleteObject(config, row.key)));
  const removed = rows.filter((_, index) => results[index]?.status === "fulfilled").map((row) => row.id);
  const failed = rows.length - removed.length;
  if (failed > 0) console.error(`[files] ${String(failed)} R2 objects could not be deleted; the cleanup job will retry.`);
  if (removed.length === 0) return removed;
  await removeCopiesOf(removed);
  await getDb().delete(artifactFile).where(inArray(artifactFile.id, removed));
  return removed;
}

/**
 * Deletes the file rows `where` matches, in one statement, then the R2
 * objects those rows held at that moment (`returning`). A replace can swap
 * a new object into a row at any time (replace.ts), so the key is read by
 * the delete itself, never earlier: the object that goes is always the one
 * the deleted row held. An object R2 refuses to delete is logged and stays
 * without a row. Returns the rows deleted.
 */
export async function deleteFileRows(where: SQL | undefined): Promise<Pick<ArtifactFileRecord, "id" | "key">[]> {
  const rows = (await getDb().delete(artifactFile).where(where).returning()).map((row) => ({ id: row.id, key: row.key }));
  await deleteStoredObjects(rows);
  return rows;
}

/**
 * Deletes the uploader's own upload while it is in no artifact, in one
 * statement: the row goes only if it is still unattached and theirs, so an
 * attach landing at the same moment (another tab, an agent) keeps its file.
 * The R2 object goes after; if that fails, it is logged and stays in R2
 * without a row. Returns true when the upload was deleted.
 */
export async function removeUnattachedUpload(fileId: string, uploaderId: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(artifactFile)
    .where(and(eq(artifactFile.id, fileId), isNull(artifactFile.artifactId), eq(artifactFile.uploaderId, uploaderId)))
    .returning();
  if (!row) return false;
  try {
    await deleteObject(r2ConfigFromEnv(), row.key);
  } catch {
    console.error("[files] A discarded upload's R2 object could not be deleted.");
  }
  return true;
}

/**
 * Deletes every file of an artifact, and every old copy of its replaced
 * files, before the artifact itself is deleted. The rows go first, with
 * the keys they hold then (deleteFileRows), so a replace landing meanwhile
 * never leaves its new object behind. A copy a replace makes after this
 * loses its artifact when it goes, and the cleanup job removes it.
 */
export async function deleteArtifactFiles(artifactId: string): Promise<void> {
  await removeArtifactCopies(artifactId);
  await deleteFileRows(eq(artifactFile.artifactId, artifactId));
}

/** The most files one cleanup run removes. The next run continues. */
export const cleanupBatchSize = 200;

/**
 * Removes abandoned files: uploads still pending after an hour, and files
 * never attached to an artifact after a day (including files left behind
 * by a deleted artifact or account), then old copies whose file or
 * artifact is gone. Rows go before their objects (deleteFileRows); an object
 * R2 refuses to delete is logged. Returns how many were removed.
 */
export async function cleanupAbandonedFiles(now: Date = new Date()): Promise<{ removed: number; remaining: boolean }> {
  const rows = await getDb().select({ id: artifactFile.id }).from(artifactFile).where(abandonedFiles(now)).orderBy(asc(artifactFile.createdAt)).limit(cleanupBatchSize);
  const removed = await removeAbandonedFiles(rows.map((row) => row.id), now);
  const copies = await cleanupOrphanCopies();
  return { removed: removed + copies.removed, remaining: rows.length === cleanupBatchSize || copies.remaining };
}

/** File rows the cleanup job removes: uploads still pending after an hour, and files in no artifact after a day. */
function abandonedFiles(now: Date) {
  return or(
    and(eq(artifactFile.status, "pending"), lt(artifactFile.createdAt, new Date(now.getTime() - fileLimits.pendingTtlMs))),
    and(isNull(artifactFile.artifactId), lt(artifactFile.createdAt, new Date(now.getTime() - fileLimits.unattachedTtlMs))),
  );
}

/**
 * Deletes the cleanup job's picks, checking in the delete itself that each
 * is still abandoned, so an upload a replace or an attach used since the
 * job picked it stays where it went and keeps its object. Returns how many went.
 */
export async function removeAbandonedFiles(fileIds: readonly string[], now: Date = new Date()): Promise<number> {
  if (fileIds.length === 0) return 0;
  return (await deleteFileRows(and(inArray(artifactFile.id, [...fileIds]), abandonedFiles(now)))).length;
}
