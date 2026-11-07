import type { DocsSearchEntry } from "./navigation";

/**
 * Client-side docs search: every word of the query must appear in the
 * entry's title, context, or keywords. Titles that start with the query rank
 * first, then other title matches, then pages before headings.
 */

const kindRank: Record<DocsSearchEntry["kind"], number> = { page: 0, component: 1, tool: 2, heading: 3 };

function words(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function score(entry: DocsSearchEntry, query: string): number {
  const title = entry.title.toLowerCase();
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  return 3;
}

/** Entries that match every word of `query`, best first, at most `limit`. */
export function searchDocs(index: readonly DocsSearchEntry[], query: string, limit = 12): DocsSearchEntry[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  const whole = terms.join(" ");
  return index
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.context} ${entry.keywords}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map((entry) => ({ entry, rank: score(entry, whole) * 10 + kindRank[entry.kind] }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
