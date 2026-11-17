import { fileLimits } from "./config";

/**
 * How many files one artifact may hold, by how a file got there. A file a
 * content save attached because the content names it (a picture in a
 * document's text) is content media; every other attached file is a plain
 * attachment (files_attach, "Attach file", an icon or cover image). The two
 * are counted apart, so a document with many pictures never uses up the
 * room for attachments, and the reverse. Page files have limits of their
 * own (src/lib/page-files/rules.ts). Pure, so the rule is tested without a
 * database; attach.ts reads the counts.
 */

/** The two kinds of attached file that are counted. */
export type FileBucket = "plain" | "inline";

/** How many of each an artifact holds, or keeps only for Restore. */
export type FileCounts = Record<FileBucket, number>;

/** The most an artifact holds of each. */
export const fileBucketLimits: FileCounts = {
  plain: fileLimits.maxFilesPerArtifact,
  inline: fileLimits.maxInlineFilesPerArtifact,
};

/**
 * Most distinct files a Markdown save may attach or keep: every file its
 * text can show, and every plain attachment it can link. Links to files
 * the author cannot use are not counted (attachableMarkdownFiles).
 */
export const maxMarkdownFileRefs = fileBucketLimits.plain + fileBucketLimits.inline;

/** True when `adding` more files fit, before the files kept only for Restore are looked up. */
export function fitsAtOnce(existing: number, adding: number, bucket: FileBucket): boolean {
  return existing + adding <= fileBucketLimits[bucket];
}

interface Room {
  bucket: FileBucket;
  /** Files of this kind the artifact holds, those kept only for Restore included. */
  existing: number;
  /** Of those, the ones only older versions show. They do not count. */
  historyOnly: number;
  adding: number;
}

/** True when the artifact can take `adding` more files of this kind. */
export function hasRoom({ bucket, existing, historyOnly, adding }: Room): boolean {
  return existing - historyOnly + adding <= fileBucketLimits[bucket];
}

/** What a refused file is told, for people and agents alike. */
export function fullMessage(bucket: FileBucket): string {
  if (bucket === "inline") return `An artifact shows at most ${String(fileBucketLimits.inline)} files in its content. Remove some first.`;
  return `An artifact holds at most ${String(fileBucketLimits.plain)} files. Remove some first.`;
}
