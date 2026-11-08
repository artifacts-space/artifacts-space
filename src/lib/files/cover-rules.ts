import { canUseFileInArtifact } from "./access-rules";
import { iconImageTypes, type IconFileSubject } from "./icon-rules";

/**
 * Rules for an uploaded image used as a cover (`file:<uuid>`). The same image
 * types as icons (never SVG, which can carry script), with a larger cap for
 * wide images. Pure, so they are tested without a database; cover-file.ts
 * loads the row.
 */

/** Largest cover image, in bytes (2 MB). */
export const COVER_MAX_BYTES = 2_097_152;

/**
 * Why a file cannot be this artifact's cover, written for the person or
 * agent who sent it, or null when it can. It must exist, be finished, be an
 * image of an allowed type within the size cap, and be usable in this
 * artifact: already attached to it, or the editor's own unattached upload
 * (attached on save). `artifactId` is null on create.
 */
export function coverFileProblem(file: IconFileSubject | null, editorId: string, artifactId: string | null): string | null {
  if (!file) return "That cover file was not found. Upload the image (files_request_upload, PUT, files_finalize) and use the id you get back.";
  if (file.status !== "ready") return "That cover file is still uploading. Finish it with files_finalize first.";
  if (!canUseFileInArtifact(file, editorId, artifactId)) return "That cover file belongs to another artifact or another person. Upload the image for this artifact.";
  if (!iconImageTypes.has(file.contentType)) return "A cover image must be a PNG, JPEG, GIF, WebP, or AVIF file. SVG is not allowed.";
  if (file.size > COVER_MAX_BYTES) return "A cover image can be at most 2 MB.";
  return null;
}

/** True when the picked file can become a cover, before upload: type and size only. */
export function isCoverUploadAllowed(file: { type: string; size: number }): boolean {
  return iconImageTypes.has(file.type) && file.size > 0 && file.size <= COVER_MAX_BYTES;
}
