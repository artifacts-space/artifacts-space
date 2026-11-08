import type { FileStatus } from "./config";

/** The fields of a file that decide who can read it. */
export interface FileAccessSubject {
  status: FileStatus;
  uploaderId: string | null;
  artifactId: string | null;
  attachedAt: Date | null;
}

/**
 * What the artifact's own access check said. `servedVersionAt` is set when
 * the viewer reads an approved version of a link or public artifact (they are
 * outside its team): then only files attached by that version's time count.
 * `hiddenImage` is true when the file is an icon or cover image that the
 * served version does not show (see hiddenImageFiles): kept for Restore,
 * never for readers outside the team.
 */
export interface FileArtifactAccess {
  viewable: boolean;
  servedVersionAt: Date | null;
  hiddenImage: boolean;
}

/**
 * The single read rule for files. A file is readable when it is ready and:
 * unattached files only by their uploader; attached files by whoever can
 * view the artifact, limited to files attached by the version they are
 * served, and never an old icon or cover image that version does not show.
 * Everything else reads as "not found".
 */
export function canReadFile(file: FileAccessSubject, viewerId: string | null, artifact: FileArtifactAccess | null): boolean {
  if (file.status !== "ready") return false;
  if (file.artifactId === null) return viewerId !== null && file.uploaderId === viewerId;
  if (!artifact?.viewable) return false;
  if (artifact.servedVersionAt === null) return true;
  if (artifact.hiddenImage) return false;
  return file.attachedAt !== null && file.attachedAt.getTime() <= artifact.servedVersionAt.getTime();
}

/**
 * Whether a person may use a file in an artifact they write: it is ready,
 * and either already belongs to that artifact or is their own unattached upload.
 */
export function canUseFileInArtifact(file: Pick<FileAccessSubject, "status" | "uploaderId" | "artifactId">, authorId: string, artifactId: string | null): boolean {
  if (file.status !== "ready") return false;
  if (file.artifactId !== null) return artifactId !== null && file.artifactId === artifactId;
  return file.uploaderId === authorId;
}
