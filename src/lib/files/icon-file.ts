import { iconFileId } from "@/lib/artifact-icons";
import { UserFacingError } from "@/lib/user-facing-error";

import { assertUsableFiles } from "./attach";
import { iconFileProblem } from "./icon-rules";
import { getFileRow } from "./store";

/**
 * Uploaded images as page icons. The data layer calls these on create, on
 * save, and on restore, so web and MCP share one check.
 */

/**
 * Checks the file an icon points at and returns its id in a list (empty for
 * emoji, Tabler, or no icon), so the caller attaches it with the content's
 * files. Throws a UserFacingError when the file cannot be this artifact's icon.
 */
export async function checkIconFile(editorId: string, artifactId: string | null, icon: string | null | undefined): Promise<string[]> {
  const fileId = iconFileId(icon);
  if (!fileId) return [];
  const problem = iconFileProblem(await getFileRow(fileId), editorId, artifactId);
  if (problem) throw new UserFacingError(problem);
  // The per-artifact file count, and the same ownership rule as content files.
  await assertUsableFiles(editorId, artifactId, [fileId]);
  return [fileId];
}

/**
 * The icon a restore brings back: the version's icon, unless it is an image
 * that is gone or no longer this artifact's, which restores as no icon.
 */
export async function restorableIcon(editorId: string, artifactId: string, icon: string | null): Promise<string | null> {
  const fileId = iconFileId(icon);
  if (!fileId) return icon;
  return iconFileProblem(await getFileRow(fileId), editorId, artifactId) ? null : icon;
}
