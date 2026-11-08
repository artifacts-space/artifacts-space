import type { TagFacet } from "@/lib/tags/queries";
import { normalizeTag } from "@/lib/tags/rules";

/** The most suggestions shown under the tag input. */
const MAX_SUGGESTIONS = 8;

/**
 * The tags to suggest for what was typed: the scope's tags that contain it
 * (those starting with it first), most used first, leaving out tags the
 * artifact already has. With nothing typed, the most used tags.
 */
export function suggestionsFor(all: readonly TagFacet[], typed: string, current: readonly string[]): string[] {
  const needle = normalizeTag(typed);
  const taken = new Set(current);
  const open = all.filter((facet) => !taken.has(facet.tag) && facet.tag.includes(needle));
  const starts = open.filter((facet) => facet.tag.startsWith(needle));
  const rest = open.filter((facet) => !facet.tag.startsWith(needle));
  return [...starts, ...rest].slice(0, MAX_SUGGESTIONS).map((facet) => facet.tag);
}

/** The tags after adding what was typed, or null when it adds nothing (empty, or already there). */
export function withTyped(current: readonly string[], typed: string): string[] | null {
  const tag = normalizeTag(typed);
  if (!tag || current.includes(tag)) return null;
  return [...current, tag];
}
