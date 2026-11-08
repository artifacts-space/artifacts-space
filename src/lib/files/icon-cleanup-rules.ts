import { iconFileId } from "@/lib/artifact-icons";
import { coverFileId } from "@/lib/covers/cover";

import { fileRefsInContent } from "./refs";

/**
 * Which old icon and cover images an artifact no longer needs, and which ones
 * a reader of the approved version may not open. Pure, so it is tested
 * without a database; icon-cleanup.ts and served-images.ts load the rows.
 */

/** An icon and a cover, as stored on the artifact or one of its versions. */
export interface ImageRefs {
  icon: string | null;
  cover: string | null;
}

/** What decides whether a file is still in use: one shown state of the artifact. */
export interface IconUseState extends ImageRefs {
  kind: string;
  content: string;
}

/** The uploaded image an icon or cover value points at, or null. */
export function imageFileIdOf(value: string | null | undefined): string | null {
  return iconFileId(value) ?? coverFileId(value);
}

/** The uploaded images one icon-and-cover pair shows. */
export function imageFileIdsOf(refs: ImageRefs): string[] {
  return [iconFileId(refs.icon), coverFileId(refs.cover)].filter((id): id is string => id !== null);
}

/**
 * The candidate files (images that were once the icon or cover) nothing
 * keeps any more. A file stays while the current artifact shows it (as the
 * icon or cover, or from an Image or File element), or while any version
 * still in the history shows it as the icon or cover, so Restore always
 * brings the image back. It goes once history pruning drops the last version
 * that showed it. In a file artifact every attachment is content, so nothing
 * is removed there. Content references in older versions are checked by the
 * caller, in the database, for whatever this leaves.
 */
export function unusedIconFiles(candidates: readonly string[], current: IconUseState, retained: readonly ImageRefs[]): string[] {
  if (current.kind === "file") return [];
  const used = new Set([...fileRefsInContent(current.kind, current.content), ...imageFileIdsOf(current), ...retained.flatMap(imageFileIdsOf)]);
  return [...new Set(candidates)].filter((fileId) => !used.has(fileId));
}

/** The version a reader outside the team is served: its icon, cover, and content. */
export interface ServedImageState extends ImageRefs {
  kind: string;
  /** The served content's file references; only ui content has any. */
  contentRefs: readonly string[];
}

/**
 * The icon and cover images a reader of the approved version may not open:
 * images some version (or the latest save) showed as its icon or cover that
 * the approved version shows neither as its icon or cover nor from its
 * content. Kept images let Restore bring a cover back, but they never widen
 * what readers outside the team can see. A file artifact's attachments are
 * all content, so none is hidden there.
 */
export function hiddenImageFiles(imageIds: Iterable<string>, served: ServedImageState): Set<string> {
  if (served.kind === "file") return new Set();
  const shown = new Set([...imageFileIdsOf(served), ...served.contentRefs]);
  return new Set([...imageIds].filter((fileId) => !shown.has(fileId)));
}
