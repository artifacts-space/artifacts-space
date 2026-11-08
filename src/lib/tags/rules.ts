import { z, ZodError } from "zod";

import { UserFacingError } from "@/lib/user-facing-error";

import { tagLimits } from "./limits";

/**
 * Tags: free-form labels on an artifact, many per artifact. Stored on the
 * artifact itself (artifact.tags), so a tag needs no row of its own; a
 * scope's vocabulary is the set of tags its artifacts use (the same scope
 * as projects, src/lib/projects/rules.ts). Like projects, tags are for the
 * author and the team only, never for readers outside it.
 */

const invisible = /[\p{Cc}\p{Cf}]/gu;
const spaces = /\s+/g;
const dashes = /-{2,}/g;
const edgeDashes = /^-+|-+$/g;
// Commas separate tags in inputs, and "#" is how people type them; neither is part of a tag.
const separators = /[,#]/g;

/**
 * A tag as stored: NFC, lowercase, no control characters, commas, or "#",
 * spaces collapsed into "-", no leading, trailing, or repeated dashes. ""
 * when nothing is left. Length is checked separately.
 */
export function normalizeTag(value: string): string {
  return value
    .normalize("NFC")
    .replace(invisible, "")
    .replace(separators, " ")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(spaces, "-")
    .replace(dashes, "-")
    .replace(edgeDashes, "");
}

/** Characters as people count them (code points), for the length limit. */
function charCount(value: string): number {
  // Code points, as the database's char_length counts them.
  return Array.from(value).length;
}

const LENGTH_MESSAGE = `Tags are 1 to ${String(tagLimits.maxChars)} characters.`;
const COUNT_MESSAGE = `An artifact can have up to ${String(tagLimits.maxPerArtifact)} tags.`;

/** One tag at a boundary: normalized, then 1 to maxChars characters. */
export const tagSchema = z
  .string()
  .max(tagLimits.maxChars * 4, LENGTH_MESSAGE)
  .transform(normalizeTag)
  .refine((tag) => tag.length > 0 && charCount(tag) <= tagLimits.maxChars, LENGTH_MESSAGE);

/**
 * A full set of tags at a boundary: each normalized, empty ones dropped,
 * duplicates merged (first spelling wins, order kept), at most maxPerArtifact.
 */
export const tagListSchema = z
  .array(z.string().max(tagLimits.maxChars * 4, LENGTH_MESSAGE))
  .max(tagLimits.maxPerArtifact * 4, COUNT_MESSAGE)
  .transform((values) => values.map(normalizeTag).filter((tag) => tag.length > 0))
  .refine((tags) => tags.every((tag) => charCount(tag) <= tagLimits.maxChars), LENGTH_MESSAGE)
  .transform((tags) => [...new Set(tags)])
  .refine((tags) => tags.length <= tagLimits.maxPerArtifact, COUNT_MESSAGE);

/** A tag change: replace the whole set, or add and remove some. */
export type TagChange = { set: string[] } | { add: string[]; remove: string[] };

/** The tags after a change, normalized and capped. Throws a ZodError the caller can show. */
export function applyTagChange(current: readonly string[], change: TagChange): string[] {
  if ("set" in change) return tagListSchema.parse(change.set);
  const removed = new Set(tagListSchema.parse(change.remove));
  const next = [...current.filter((tag) => !removed.has(tag)), ...change.add];
  return tagListSchema.parse(next);
}

/** The tags a change brings that the scope does not use yet. */
export function newTags(next: readonly string[], vocabulary: ReadonlySet<string>): string[] {
  return next.filter((tag) => !vocabulary.has(tag));
}

/** True when adding `adding` new tags would take a scope past its runaway cap. */
export function vocabularyWouldOverflow(size: number, adding: number): boolean {
  return adding > 0 && size + adding > tagLimits.maxPerScope;
}

/** How tags show on a list row: the first few, and how many more there are. */
export function rowTags(tags: readonly string[], shown = 2): { visible: string[]; more: number } {
  return { visible: tags.slice(0, shown), more: Math.max(0, tags.length - shown) };
}

/** Runs a tag rule, turning a validation error into a message people and agents can act on. */
export function parseTags<T>(rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof ZodError) throw new UserFacingError(error.issues[0]?.message ?? "Those tags are not valid.");
    throw error;
  }
}

/**
 * Checks a tag change's own tags (length, count) before anything is saved,
 * so a bad tag never leaves a half-applied update. Returns the change with
 * its tags normalized.
 */
export function checkTagChange(change: TagChange): TagChange {
  if ("set" in change) return { set: parseTags(() => applyTagChange([], change)) };
  return { add: parseTags(() => tagListSchema.parse(change.add)), remove: parseTags(() => tagListSchema.parse(change.remove)) };
}

