import { iconFileId } from "@/lib/artifact-icons";
import { coverFileId } from "@/lib/covers/cover";

import { allowedFileTypes, fileExtension, isAllowedFileType } from "./config";
import { sanitizeFilename } from "./names";

/**
 * Replacing a file keeps its entry: the id, its place in the list, and the
 * name people know it by. Pure rules, tested without a database; replace.ts
 * and copies.ts load and write the rows.
 */

/** A file's name and type. */
export interface NamedFile {
  filename: string;
  contentType: string;
}

function defaultExtension(contentType: string): string {
  return isAllowedFileType(contentType) ? allowedFileTypes[contentType].extensions[0] : "";
}

function stem(filename: string): string {
  const extension = fileExtension(filename);
  return extension ? filename.slice(0, filename.length - extension.length - 1) : filename;
}

/**
 * The name a file keeps after a replace: its own name when the type stays
 * the same, or its own name with the new file's extension when the type
 * changes, so "SOW.docx" replaced by "draft (3).pdf" becomes "SOW.pdf".
 */
export function replacementFilename(current: NamedFile, next: NamedFile): string {
  if (current.contentType === next.contentType) return current.filename;
  const nextExtension = fileExtension(next.filename);
  const extension = nextExtension && defaultExtensionMatches(next.contentType, nextExtension) ? nextExtension : defaultExtension(next.contentType);
  return sanitizeFilename(extension ? `${stem(current.filename)}.${extension}` : stem(current.filename));
}

function defaultExtensionMatches(contentType: string, extension: string): boolean {
  if (!isAllowedFileType(contentType)) return false;
  const known: readonly string[] = allowedFileTypes[contentType].extensions;
  return known.includes(extension);
}

/** The fields of a file entry that decide whether it can be replaced. */
export interface ReplaceTarget {
  status: string;
  artifactId: string | null;
  attachedByContent: boolean;
}

/**
 * Why a file entry cannot be replaced, or null when it can. Only plain
 * attachments (the Files section, files_attach) are replaced. Media a
 * document embeds changes in the document, and icon and cover images
 * through their pickers, which check their own size and type rules.
 */
export function replaceTargetProblem(target: ReplaceTarget | null, options: { shownAsImage: boolean }): string | null {
  if (target?.status !== "ready" || target.artifactId === null) return "File not found.";
  if (target.attachedByContent) return "This file is shown in the document. Replace it there instead.";
  if (options.shownAsImage) return "This image is the artifact's icon or cover. Change it from the icon or cover instead.";
  return null;
}

/**
 * Whether the Files section offers Replace for a file: not media the
 * document embeds, and not an image the artifact or any version shows as
 * its icon or cover (`pictured`, and the artifact's icon and cover as the
 * page has them now). The server checks the same (replaceTargetProblem);
 * this only spares people an upload it would refuse.
 */
export function offersReplace(file: { id: string; embedded?: boolean | undefined; pictured?: boolean | undefined }, artifact: { icon: string | null; cover: string | null }): boolean {
  if (file.embedded === true || file.pictured === true) return false;
  return iconFileId(artifact.icon) !== file.id && coverFileId(artifact.cover) !== file.id;
}

/** One old copy as the served-copy rule sees it. */
export interface CopyWindow {
  currentFrom: Date | null;
  replacedAt: Date;
}

/** True when the copy was the current file at `at`: from when it became current until a newer upload replaced it. */
export function copyCurrentAt(copy: CopyWindow, at: Date): boolean {
  return (copy.currentFrom === null || copy.currentFrom.getTime() <= at.getTime()) && at.getTime() < copy.replacedAt.getTime();
}

/** True when the file was replaced after `at`, so a reader of the version saved then gets an older copy. */
export function replacedSince(file: { replacedAt: Date | null }, at: Date | null): boolean {
  return at !== null && file.replacedAt !== null && file.replacedAt.getTime() > at.getTime();
}
