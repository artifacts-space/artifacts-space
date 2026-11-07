import { canUseFileInArtifact, type FileAccessSubject } from "./access-rules";

/**
 * Rules for an uploaded image used as a page icon (`file:<uuid>`). Pure, so
 * they are tested without a database; icon-file.ts loads the row.
 */

/** Image types an icon may be. SVG is never allowed: it can carry script. */
export const iconImageTypes: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/** Largest icon image, in bytes (1 MB). */
export const ICON_MAX_BYTES = 1_048_576;

/** What the icon rules need to know about a file. */
export interface IconFileSubject extends Pick<FileAccessSubject, "status" | "uploaderId" | "artifactId"> {
  contentType: string;
  size: number;
}

/**
 * Why a file cannot be this artifact's icon, written for the person or agent
 * who sent it, or null when it can. It must exist, be finished, be an image
 * of an allowed type within the size cap, and be usable in this artifact:
 * already attached to it, or the editor's own unattached upload (attached on
 * save). `artifactId` is null on create.
 */
export function iconFileProblem(file: IconFileSubject | null, editorId: string, artifactId: string | null): string | null {
  if (!file) return "That icon file was not found. Upload the image (files_request_upload, PUT, files_finalize) and use the id you get back.";
  if (file.status !== "ready") return "That icon file is still uploading. Finish it with files_finalize first.";
  if (!canUseFileInArtifact(file, editorId, artifactId)) return "That icon file belongs to another artifact or another person. Upload the image for this artifact.";
  if (!iconImageTypes.has(file.contentType)) return "An icon image must be a PNG, JPEG, GIF, WebP, or AVIF file. SVG is not allowed.";
  if (file.size > ICON_MAX_BYTES) return "An icon image can be at most 1 MB.";
  return null;
}

/** True when the picked file can become an icon, before upload: type and size only. */
export function isIconUploadAllowed(file: { type: string; size: number }): boolean {
  return iconImageTypes.has(file.type) && file.size > 0 && file.size <= ICON_MAX_BYTES;
}
