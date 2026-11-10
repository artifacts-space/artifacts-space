import { and, eq, inArray, like, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, artifactVersion } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";

import { imageFileIdOf, imageFileIdsOf, unusedIconFiles, type IconUseState } from "./icon-cleanup-rules";
import { fileRefsInContent } from "./refs";
import { deleteStoredObjects, getFileRows, removeFiles } from "./store";

/**
 * Deletes icon and cover images an artifact no longer keeps. An image stays
 * while the artifact shows it or any version in its history shows it, so
 * Remove is undone by Restore. Callers pass the images that may have just
 * lost their last user: the icon and cover before a save (a quick follow-up
 * save merges into the newest version and replaces what it showed), or the
 * images of versions history pruning just dropped.
 *
 * Content media (files a content save attached, `attached_by_content`)
 * follows the same rule: kept while the artifact or any version still
 * names it, removed with the last one that did, and not counted toward the
 * file limit while only older versions name it. A file attached any other
 * way (files_attach, the Files panel) is never removed here, even after
 * content linked it and stopped.
 */

/** The icons and covers every version of the artifact shows that point at an uploaded image. */
function retainedImageRefs(artifactId: string) {
  return getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
}

/** For an `artifact_file` row: no ui or Markdown version of the artifact names it in its content (a case-insensitive text match, so it errs on keeping). */
function notNamedByVersions(artifactId: string) {
  return sql`not exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and v.kind in ('ui', 'markdown') and strpos(lower(v.content), "artifact_file"."id") > 0)`;
}

/**
 * For an `artifact_file` row: neither the artifact's current content nor any
 * of its versions names it. The row is written out as "artifact_file"."id",
 * never a bare `id`, which inside a subquery would mean that table's own id
 * (the correlated-subquery tripwire in AGENTS.md).
 */
export function notNamedByArtifact(artifactId: string) {
  return sql`not exists (select 1 from ${artifact} a where a.id = ${artifactId} and strpos(lower(a.content), "artifact_file"."id") > 0) and ${notNamedByVersions(artifactId)}`;
}

/** The files among `fileIds` that no ui or Markdown version of the artifact names in its content, in one query however many there are. */
async function notNamedInContent(artifactId: string, fileIds: readonly string[]): Promise<string[]> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(inArray(artifactFile.id, [...fileIds]), notNamedByVersions(artifactId)));
  return rows.map((row) => row.id);
}

/** The artifact's state that decides what it still shows, or null when it is gone. */
async function currentState(artifactId: string): Promise<IconUseState | null> {
  const [record] = await getDb()
    .select({ icon: artifact.icon, cover: artifact.cover, kind: artifact.kind, content: artifact.content })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  return record ?? null;
}

/** The files among `fileIds` that neither the artifact nor any version in its history shows, as the icon or cover or in its content. */
async function unusedFiles(artifactId: string, fileIds: readonly string[], current: IconUseState): Promise<string[]> {
  if (fileIds.length === 0) return [];
  const unreferenced = unusedIconFiles(fileIds, current, await retainedImageRefs(artifactId));
  return unreferenced.length > 0 ? notNamedInContent(artifactId, unreferenced) : [];
}

/**
 * Deletes the images among `candidates` (stored icon or cover values)
 * that neither the artifact nor any version in its history shows. Returns
 * how many files went. Only files attached to this artifact are ever removed.
 */
export async function pruneUnusedIconFiles(artifactId: string, candidates: readonly (string | null)[]): Promise<number> {
  const fileIds = candidates.flatMap((value) => {
    const fileId = imageFileIdOf(value);
    return fileId ? [fileId] : [];
  });
  if (fileIds.length === 0) return 0;
  const current = await currentState(artifactId);
  if (!current) return 0;
  const unused = await unusedFiles(artifactId, fileIds, current);
  if (unused.length === 0) return 0;
  const rows = (await getFileRows(unused)).filter((row) => row.artifactId === artifactId);
  return (await removeFiles(rows)).length;
}

/** The artifact's content media that its current state does not show. */
async function contentFilesNotShown(artifactId: string, current: IconUseState): Promise<string[]> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), eq(artifactFile.attachedByContent, true)));
  if (rows.length === 0) return [];
  const shown = new Set([...fileRefsInContent(current.kind, current.content), ...imageFileIdsOf(current)]);
  return rows.map((row) => row.id).filter((fileId) => !shown.has(fileId));
}


/**
 * Deletes the rows of the content media among `fileIds` in one statement,
 * checking at that moment that neither the artifact's current content nor
 * any version names them, and returns the rows it deleted. One statement,
 * because the production driver (neon-http) has no interactive
 * transactions or row locks: a save that wrote content naming the file
 * before this runs keeps it, and no window opens in which the file could be
 * attached again and then deleted.
 */
export function deleteUnnamedContentFiles(artifactId: string, fileIds: readonly string[]) {
  return getDb()
    .delete(artifactFile)
    .where(and(inArray(artifactFile.id, [...fileIds]), eq(artifactFile.artifactId, artifactId), eq(artifactFile.attachedByContent, true), notNamedByArtifact(artifactId)))
    .returning();
}

/**
 * Deletes content media that neither the artifact nor any version in its
 * history names any more: the media a removed embed left, once history
 * pruning dropped the last version with it. `candidates` narrows the check
 * (the files a save stopped naming); without it, every content file of the
 * artifact the current state does not show is checked. Plain attachments
 * are never removed. The rows go in one checked statement
 * (deleteUnnamedContentFiles), then their R2 objects. Three queries however
 * many files the artifact keeps. Returns how many went.
 */
export async function pruneUnusedContentFiles(artifactId: string, candidates?: readonly string[]): Promise<number> {
  if (candidates?.length === 0) return 0;
  const current = await currentState(artifactId);
  if (!current) return 0;
  const fileIds = candidates ?? (await contentFilesNotShown(artifactId, current));
  if (fileIds.length === 0) return 0;
  const unreferenced = unusedIconFiles(fileIds, current, await retainedImageRefs(artifactId));
  if (unreferenced.length === 0) return 0;
  const deleted = await deleteUnnamedContentFiles(artifactId, unreferenced);
  await deleteStoredObjects(deleted);
  return deleted.length;
}

/**
 * How many of the artifact's attached files only older versions show, kept
 * so Restore can bring them back: icon or cover images, and content media
 * the artifact no longer shows. They do not count
 * toward the per-artifact file limit, so changing a cover or swapping
 * screenshots many times never blocks the next upload; history retention
 * (and the account's storage quota) bounds them instead.
 */
export async function countHistoryOnlyFiles(artifactId: string): Promise<number> {
  const current = await currentState(artifactId);
  if (!current) return 0;
  const shownByVersions = (await retainedImageRefs(artifactId)).flatMap(imageFileIdsOf);
  const historyOnlyImages = unusedIconFiles(shownByVersions, current, []);
  const [images, contentFiles] = await Promise.all([
    historyOnlyImages.length > 0 ? getFileRows(historyOnlyImages) : Promise.resolve([]),
    contentFilesNotShown(artifactId, current),
  ]);
  const attachedImages = images.filter((row) => row.artifactId === artifactId).map((row) => row.id);
  return new Set([...attachedImages, ...contentFiles]).size;
}

/** pruneUnusedIconFiles as housekeeping: a failure is logged, never thrown, and the save stands. */
export async function pruneUnusedIconFilesQuietly(artifactId: string, candidates: readonly (string | null)[]): Promise<void> {
  await pruneUnusedIconFiles(artifactId, candidates).catch((error: unknown) => {
    console.error("[files] Removing an unused icon image failed", error instanceof Error ? error.name : "unknown error");
  });
}

/** pruneUnusedContentFiles as housekeeping: a failure is logged, never thrown, and the save or cleanup stands. */
export async function pruneUnusedContentFilesQuietly(artifactId: string, candidates?: readonly string[]): Promise<void> {
  await pruneUnusedContentFiles(artifactId, candidates).catch((error: unknown) => {
    console.error("[files] Removing an unused content file failed", error instanceof Error ? error.name : "unknown error");
  });
}
