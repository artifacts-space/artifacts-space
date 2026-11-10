import { and, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, artifactVersion, type ArtifactFileRecord } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";

import { imageFileIdOf, imageFileIdsOf, unusedIconFiles, type IconUseState } from "./icon-cleanup-rules";
import { fileRefsInContent } from "./refs";
import { getFileRows, removeFiles } from "./store";

/**
 * Deletes icon and cover images an artifact no longer keeps. An image stays
 * while the artifact shows it or any version in its history shows it, so
 * Remove is undone by Restore. Callers pass the images that may have just
 * lost their last user: the icon and cover before a save (a quick follow-up
 * save merges into the newest version and replaces what it showed), or the
 * images of versions history pruning just dropped.
 *
 * Files the content once embedded or linked (`named_in_content_at`) follow
 * the same rule: kept while the artifact or any version still names them,
 * deleted with the last one that did, and not counted toward the file limit
 * while only older versions name them. Plain attachments, which no content
 * ever named, are never removed here.
 */

/** The icons and covers every version of the artifact shows that point at an uploaded image. */
function retainedImageRefs(artifactId: string) {
  return getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
}

/** Whether any ui or Markdown version of the artifact still names this file in its content (an Image or File element, or a media embed or link). A plain text match, case-insensitive like every other content match (content-files.ts), so it errs on keeping. */
async function namedInVersionContent(artifactId: string, fileId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: artifactVersion.id })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), inArray(artifactVersion.kind, ["ui", "markdown"]), sql`strpos(lower(${artifactVersion.content}), ${fileId.toLowerCase()}) > 0`))
    .limit(1);
  return row !== undefined;
}

/** The files no ui or Markdown version of the artifact names in its content. */
async function notNamedInContent(artifactId: string, fileIds: readonly string[]): Promise<string[]> {
  const named = await Promise.all(fileIds.map((fileId) => namedInVersionContent(artifactId, fileId)));
  return fileIds.filter((_, index) => named[index] === false);
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

/**
 * Deletes the files among `fileIds` that neither the artifact nor any
 * version in its history shows (as the icon or cover, or in its content),
 * and that `removable` allows. Only files attached to this artifact are ever
 * removed. Returns how many went.
 */
async function removeUnused(artifactId: string, fileIds: readonly string[], current: IconUseState, removable: (row: ArtifactFileRecord) => boolean): Promise<number> {
  if (fileIds.length === 0) return 0;
  const unreferenced = unusedIconFiles(fileIds, current, await retainedImageRefs(artifactId));
  const unused = unreferenced.length > 0 ? await notNamedInContent(artifactId, unreferenced) : [];
  if (unused.length === 0) return 0;
  const rows = (await getFileRows(unused)).filter((row) => row.artifactId === artifactId && removable(row));
  return (await removeFiles(rows)).length;
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
  return current ? removeUnused(artifactId, fileIds, current, () => true) : 0;
}

/** The artifact's attached files that content once named and its current state does not show. */
async function contentFilesNotShown(artifactId: string, current: IconUseState): Promise<string[]> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.namedInContentAt)));
  if (rows.length === 0) return [];
  const shown = new Set([...fileRefsInContent(current.kind, current.content), ...imageFileIdsOf(current)]);
  return rows.map((row) => row.id).filter((fileId) => !shown.has(fileId));
}

/**
 * Deletes files the content once named that neither the artifact nor any
 * version in its history names any more: the media a removed embed left,
 * once a merged save or history pruning dropped the last version with it.
 * `candidates` narrows the check (the files a save stopped naming); without
 * it, every such file of the artifact is checked. Returns how many went.
 */
export async function pruneUnusedContentFiles(artifactId: string, candidates?: readonly string[]): Promise<number> {
  if (candidates?.length === 0) return 0;
  const current = await currentState(artifactId);
  if (!current) return 0;
  const fileIds = candidates ?? (await contentFilesNotShown(artifactId, current));
  return removeUnused(artifactId, fileIds, current, (row) => row.namedInContentAt !== null);
}

/**
 * How many of the artifact's attached files only older versions show, kept
 * so Restore can bring them back: icon or cover images, and files the
 * content once named that the artifact no longer shows. They do not count
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
