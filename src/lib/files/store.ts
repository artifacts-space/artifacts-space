import { and, asc, eq, gte, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactFileRecord } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";

import { fileLimits } from "./config";
import { namedAtAttach } from "./content-files";
import { deleteObject, r2ConfigFromEnv } from "./r2";
import type { FileDto } from "./types";

/**
 * File rows in the database, and removing files from R2 with their rows.
 * Callers check who may do what; access-rules.ts holds the rules.
 */

/** Maps a row to the shape the app and agents see. */
export function toFileDto(row: ArtifactFileRecord): FileDto {
  return { id: row.id, filename: row.filename, contentType: row.contentType, size: row.size, createdAt: row.createdAt.toISOString() };
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
    .select()
    .from(artifactFile)
    .where(and(inArray(artifactFile.artifactId, [...artifactIds]), eq(artifactFile.status, "ready"), cutoff))
    .orderBy(asc(artifactFile.attachedAt), asc(artifactFile.createdAt));
  for (const row of rows) {
    if (!row.artifactId) continue;
    const list = files.get(row.artifactId) ?? [];
    list.push(toFileDto(row));
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
 * already attached anywhere are left alone. Returns how many changed.
 */
export async function attachFileRows(uploaderId: string, artifactId: string, fileIds: readonly string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await getDb()
    .update(artifactFile)
    .set({ artifactId, attachedAt: sql`now()`, namedInContentAt: namedAtAttach(artifactId) })
    .where(and(inArray(artifactFile.id, [...fileIds]), eq(artifactFile.uploaderId, uploaderId), eq(artifactFile.status, "ready"), isNull(artifactFile.artifactId)))
    .returning();
  return rows.length;
}

/**
 * Deletes files from R2 and then their rows. A row stays when its object
 * could not be deleted, so the cleanup job tries again. Returns the ids removed.
 */
export async function removeFiles(rows: readonly Pick<ArtifactFileRecord, "id" | "key">[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const config = r2ConfigFromEnv();
  const results = await Promise.allSettled(rows.map((row) => deleteObject(config, row.key)));
  const removed = rows.filter((_, index) => results[index]?.status === "fulfilled").map((row) => row.id);
  const failed = rows.length - removed.length;
  if (failed > 0) console.error(`[files] ${String(failed)} R2 objects could not be deleted; the cleanup job will retry.`);
  if (removed.length > 0) await getDb().delete(artifactFile).where(inArray(artifactFile.id, removed));
  return removed;
}

/**
 * Deletes every file of an artifact, before the artifact itself is deleted.
 * Files whose objects could not be deleted lose their artifact when it goes
 * (the foreign key sets null), and the cleanup job removes them later.
 */
export async function deleteArtifactFiles(artifactId: string): Promise<void> {
  const rows = await getDb().select({ id: artifactFile.id, key: artifactFile.key }).from(artifactFile).where(eq(artifactFile.artifactId, artifactId));
  await removeFiles(rows);
}

/** The most files one cleanup run removes. The next run continues. */
export const cleanupBatchSize = 200;

/**
 * Removes abandoned files: uploads still pending after an hour, and files
 * never attached to an artifact after a day (including files left behind
 * by a deleted artifact or account). Returns how many were removed.
 */
export async function cleanupAbandonedFiles(now: Date = new Date()): Promise<{ removed: number; remaining: boolean }> {
  const pendingBefore = new Date(now.getTime() - fileLimits.pendingTtlMs);
  const unattachedBefore = new Date(now.getTime() - fileLimits.unattachedTtlMs);
  const rows = await getDb()
    .select({ id: artifactFile.id, key: artifactFile.key })
    .from(artifactFile)
    .where(
      or(
        and(eq(artifactFile.status, "pending"), lt(artifactFile.createdAt, pendingBefore)),
        and(isNull(artifactFile.artifactId), lt(artifactFile.createdAt, unattachedBefore)),
      ),
    )
    .orderBy(asc(artifactFile.createdAt))
    .limit(cleanupBatchSize);
  const removed = await removeFiles(rows);
  return { removed: removed.length, remaining: rows.length === cleanupBatchSize };
}
