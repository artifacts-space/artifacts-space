import { coverFileId } from "@/lib/covers/cover";
import { UserFacingError } from "@/lib/user-facing-error";

import { assertUsableFiles } from "./attach";
import { coverFileProblem } from "./cover-rules";
import { getFileRow } from "./store";

/**
 * Uploaded images as covers. The data layer calls these on create, on save,
 * and on restore, so web and MCP share one check.
 */

/**
 * Checks the file a cover points at and returns its id in a list (empty for
 * a gradient or no cover), so the caller attaches it with the content's
 * files. Throws a UserFacingError when the file cannot be this artifact's cover.
 */
export async function checkCoverFile(editorId: string, artifactId: string | null, cover: string | null | undefined): Promise<string[]> {
  const fileId = coverFileId(cover);
  if (!fileId) return [];
  const problem = coverFileProblem(await getFileRow(fileId), editorId, artifactId);
  if (problem) throw new UserFacingError(problem);
  // The per-artifact file count, and the same ownership rule as content files.
  await assertUsableFiles(editorId, artifactId, [fileId]);
  return [fileId];
}

/**
 * The cover a restore brings back: the version's cover, unless it is an
 * image that is gone or no longer this artifact's, which restores as no cover.
 */
export async function restorableCover(editorId: string, artifactId: string, cover: string | null): Promise<string | null> {
  const fileId = coverFileId(cover);
  if (!fileId) return cover;
  return coverFileProblem(await getFileRow(fileId), editorId, artifactId) ? null : cover;
}
