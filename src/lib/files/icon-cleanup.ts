import { and, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";

import { imageFileIdOf, imageFileIdsOf, unusedIconFiles } from "./icon-cleanup-rules";
import { getFileRows, removeFiles } from "./store";

/**
 * Deletes icon and cover images an artifact no longer keeps. An image stays
 * while the artifact shows it or any version in its history shows it, so
 * Remove is undone by Restore. Callers pass the images that may have just
 * lost their last user: the icon and cover before a save (a quick follow-up
 * save merges into the newest version and replaces what it showed), or the
 * images of versions history pruning just dropped.
 */

/** The icons and covers every version of the artifact shows that point at an uploaded image. */
function retainedImageRefs(artifactId: string) {
  return getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
}

/** Whether any ui version of the artifact still names this file in its content (an Image or File element). A plain text match, so it errs on keeping. */
async function namedInVersionContent(artifactId: string, fileId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: artifactVersion.id })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), eq(artifactVersion.kind, "ui"), sql`strpos(${artifactVersion.content}, ${fileId}) > 0`))
    .limit(1);
  return row !== undefined;
}

/** The files no ui version of the artifact names in its content. */
async function notNamedInContent(artifactId: string, fileIds: readonly string[]): Promise<string[]> {
  const named = await Promise.all(fileIds.map((fileId) => namedInVersionContent(artifactId, fileId)));
  return fileIds.filter((_, index) => named[index] === false);
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
  const [record] = await getDb()
    .select({ icon: artifact.icon, cover: artifact.cover, kind: artifact.kind, content: artifact.content })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (!record) return 0;
  const unreferenced = unusedIconFiles(fileIds, record, await retainedImageRefs(artifactId));
  const unused = record.kind === "ui" ? await notNamedInContent(artifactId, unreferenced) : unreferenced;
  if (unused.length === 0) return 0;
  const rows = (await getFileRows(unused)).filter((row) => row.artifactId === artifactId);
  return (await removeFiles(rows)).length;
}

/**
 * How many of the artifact's attached files are icon or cover images that only
 * older versions show, kept so Restore can bring them back. They do not count
 * toward the per-artifact file limit, so changing a cover many times never
 * blocks the next upload; history retention bounds them instead.
 */
export async function countHistoryOnlyImages(artifactId: string): Promise<number> {
  const [record] = await getDb()
    .select({ icon: artifact.icon, cover: artifact.cover, kind: artifact.kind, content: artifact.content })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (!record) return 0;
  const shownByVersions = (await retainedImageRefs(artifactId)).flatMap(imageFileIdsOf);
  const historyOnly = unusedIconFiles(shownByVersions, record, []);
  if (historyOnly.length === 0) return 0;
  return (await getFileRows(historyOnly)).filter((row) => row.artifactId === artifactId).length;
}

/** pruneUnusedIconFiles as housekeeping: a failure is logged, never thrown, and the save stands. */
export async function pruneUnusedIconFilesQuietly(artifactId: string, candidates: readonly (string | null)[]): Promise<void> {
  await pruneUnusedIconFiles(artifactId, candidates).catch((error: unknown) => {
    console.error("[files] Removing an unused icon image failed", error instanceof Error ? error.name : "unknown error");
  });
}
