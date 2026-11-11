import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifactFileCopy, type ArtifactFileCopyRecord } from "@/db/file-copy-schema";
import { artifactFile, artifactVersion } from "@/db/schema";
import { getEditableArtifactMeta } from "@/lib/access";

import { deleteObject, r2ConfigFromEnv } from "./r2";
import { copyCurrentAt } from "./replace-rules";
import type { OldFileDto } from "./types";

/**
 * Old copies of replaced files (artifact_file_copy). Readers never reach
 * them through /api/files: a copy is served only to readers of an approved
 * version saved while it was current (download.ts), and to people who can
 * edit the artifact, through History. Copies follow version retention: one
 * stays while any version in the history was saved while it was current.
 */

/** How long after a replace before pruning may delete the copy it made: longer than the replace takes to file its version. */
export const copyPruneGraceMinutes = 5;

/** The most orphaned copies one cleanup run removes. The next run continues. */
export const copyCleanupBatchSize = 200;

/** Deletes R2 objects and returns the keys that went. A failure is logged by count, never thrown. */
async function deleteObjects(keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const config = r2ConfigFromEnv();
  const results = await Promise.allSettled(keys.map((key) => deleteObject(config, key)));
  const deleted = new Set(keys.filter((_, index) => results[index]?.status === "fulfilled"));
  if (deleted.size < keys.length) console.error(`[files] ${String(keys.length - deleted.size)} R2 objects of old file copies could not be deleted; the cleanup job will retry.`);
  return deleted;
}

/** Deletes copies' objects, then the rows whose object went. A row whose object stays waits for the cleanup job. Returns how many went. */
async function removeCopyRows(rows: readonly Pick<ArtifactFileCopyRecord, "id" | "key">[]): Promise<number> {
  const deleted = await deleteObjects(rows.map((row) => row.key));
  const ids = rows.filter((row) => deleted.has(row.key)).map((row) => row.id);
  if (ids.length > 0) await getDb().delete(artifactFileCopy).where(inArray(artifactFileCopy.id, ids));
  return ids.length;
}

/** Deletes every old copy of these file entries, for a file that is being deleted. */
export async function removeCopiesOf(fileIds: readonly string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const rows = await getDb().select({ id: artifactFileCopy.id, key: artifactFileCopy.key }).from(artifactFileCopy).where(inArray(artifactFileCopy.fileId, [...fileIds]));
  await removeCopyRows(rows);
}

/** Deletes every old copy of an artifact's files, before the artifact itself is deleted. */
export async function removeArtifactCopies(artifactId: string): Promise<void> {
  const rows = await getDb().select({ id: artifactFileCopy.id, key: artifactFileCopy.key }).from(artifactFileCopy).where(eq(artifactFileCopy.artifactId, artifactId));
  await removeCopyRows(rows);
}

/** Removes copies whose file entry or artifact is gone (an account deletion, or an object R2 refused to delete before). Returns how many went. */
export async function cleanupOrphanCopies(): Promise<{ removed: number; remaining: boolean }> {
  const rows = await getDb()
    .select({ id: artifactFileCopy.id, key: artifactFileCopy.key })
    .from(artifactFileCopy)
    .where(or(isNull(artifactFileCopy.fileId), isNull(artifactFileCopy.artifactId)))
    .orderBy(asc(artifactFileCopy.replacedAt))
    .limit(copyCleanupBatchSize);
  return { removed: await removeCopyRows(rows), remaining: rows.length === copyCleanupBatchSize };
}

/**
 * Deletes the artifact's copies that no version in its history was saved
 * while they were current: their objects first, then the rows whose object
 * went (removeCopyRows), so a copy whose object R2 refused to delete keeps
 * its row and the next prune tries again. Versions are pruned past the
 * newest 100 or after a year, but never the approved one or one waiting for
 * approval, so a copy readers or reviewers rely on always stays. Selecting
 * first is safe: a version filed later is always saved after the copy was
 * replaced, so it can never come to need a selected copy. A copy made in
 * the last few minutes is never deleted. The row names are written out
 * (c., v.), never bare, so the subquery cannot compare a column with itself
 * (the correlated-subquery tripwire in AGENTS.md). Returns how many went.
 */
export async function pruneFileCopies(artifactId: string): Promise<number> {
  const result = await getDb().execute<{ id: string; key: string }>(sql`
    select c.id, c.key from ${artifactFileCopy} c
    where c.artifact_id = ${artifactId}
      and c.replaced_at < now() - make_interval(mins => ${copyPruneGraceMinutes})
      and not exists (
        select 1 from ${artifactVersion} v
        where v.artifact_id = c.artifact_id
          and v.saved_at < c.replaced_at
          and (c.current_from is null or v.saved_at >= c.current_from)
      )
  `);
  return removeCopyRows(result.rows);
}

/** pruneFileCopies as housekeeping: a failure is logged, never thrown. */
export async function pruneFileCopiesQuietly(artifactId: string): Promise<void> {
  await pruneFileCopies(artifactId).catch((error: unknown) => {
    console.error("[files] Pruning old file copies failed", error instanceof Error ? error.name : "unknown error");
  });
}

/** For copy rows: current at `at`, from when it became current until a newer upload replaced it (the SQL form of copyCurrentAt). */
function currentAtCondition(at: Date) {
  return and(gt(artifactFileCopy.replacedAt, at), or(isNull(artifactFileCopy.currentFrom), lte(artifactFileCopy.currentFrom, at)));
}

/**
 * For each file, the copy that was current at `at`. A file with no such
 * copy is left out: replaced only before `at`, or its copy from then is
 * gone, in which case a later copy is never handed out in its place.
 */
export async function copiesCurrentAt(fileIds: readonly string[], at: Date): Promise<Map<string, ArtifactFileCopyRecord>> {
  const copies = new Map<string, ArtifactFileCopyRecord>();
  if (fileIds.length === 0) return copies;
  const rows = await getDb()
    .select()
    .from(artifactFileCopy)
    .where(and(inArray(artifactFileCopy.fileId, [...fileIds]), currentAtCondition(at)))
    .orderBy(asc(artifactFileCopy.replacedAt));
  for (const row of rows) {
    if (row.fileId && !copies.has(row.fileId) && copyCurrentAt(row, at)) copies.set(row.fileId, row);
  }
  return copies;
}

function toOldFileDto(row: ArtifactFileCopyRecord & { fileId: string }): OldFileDto {
  return { fileId: row.fileId, copyId: row.id, filename: row.filename, contentType: row.contentType, size: row.size, replacedAt: row.replacedAt.toISOString() };
}

/**
 * The artifact's files as they were at `at` (a version's save time) that a
 * replace has changed since: the copy current then, for each file that was
 * already attached. For History, for people who may edit the artifact.
 */
export async function filesReplacedSince(artifactId: string, at: Date): Promise<OldFileDto[]> {
  const rows = await getDb()
    .select({ copy: artifactFileCopy })
    .from(artifactFileCopy)
    .innerJoin(artifactFile, eq(artifactFile.id, artifactFileCopy.fileId))
    .where(and(eq(artifactFileCopy.artifactId, artifactId), eq(artifactFile.artifactId, artifactId), lte(artifactFile.attachedAt, at), currentAtCondition(at)))
    .orderBy(asc(artifactFile.attachedAt), asc(artifactFileCopy.replacedAt));
  const seen = new Set<string>();
  const files: OldFileDto[] = [];
  for (const { copy } of rows) {
    const { fileId } = copy;
    if (fileId === null || seen.has(fileId) || !copyCurrentAt(copy, at)) continue;
    seen.add(fileId);
    files.push(toOldFileDto({ ...copy, fileId }));
  }
  return files;
}

/** The name of the file each replace version replaced, by version id. */
export async function replacedFileNames(versionIds: readonly string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ versionId: artifactFileCopy.versionId, filename: artifactFileCopy.filename })
    .from(artifactFileCopy)
    .where(inArray(artifactFileCopy.versionId, [...versionIds]));
  return new Map(rows.flatMap((row) => (row.versionId ? [[row.versionId, row.filename] as const] : [])));
}

/**
 * One old copy of one file entry, for `viewerId` (null when signed out), or
 * null unless they may edit the artifact it belongs to. Readers who cannot
 * edit, even readers of the artifact, get null, as for an unknown id.
 */
export async function findEditableCopy(fileId: string, copyId: string, viewerId: string | null): Promise<ArtifactFileCopyRecord | null> {
  if (!viewerId || !z.uuid().safeParse(fileId).success || !z.uuid().safeParse(copyId).success) return null;
  const [row] = await getDb()
    .select()
    .from(artifactFileCopy)
    .where(and(eq(artifactFileCopy.id, copyId.toLowerCase()), eq(artifactFileCopy.fileId, fileId.toLowerCase())))
    .limit(1);
  if (!row?.artifactId) return null;
  return (await getEditableArtifactMeta(viewerId, row.artifactId)) ? row : null;
}
