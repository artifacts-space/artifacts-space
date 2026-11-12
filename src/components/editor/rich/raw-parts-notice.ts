import type { RawKind } from "./markdown-block-details";

const kindLabels: Readonly<Record<Exclude<RawKind, "other">, string>> = {
  html: "HTML",
  footnote: "footnotes",
  definition: "link definitions",
  image: "images",
};

/** "a", "a or b", "a, b, or c". */
function orList(words: readonly string[]): string {
  if (words.length < 3) return words.join(" or ");
  return `${words.slice(0, -1).join(", ")}, or ${words.at(-1) ?? ""}`;
}

/** What the parts use: the reasons the editor knows, and nothing it does not. */
function whatTheyUse(kinds: readonly RawKind[]): string {
  const known = kinds.flatMap((kind) => (kind === "other" ? [] : [kindLabels[kind]]));
  if (known.length > 0 && !kinds.includes("other")) return `${orList(known)}, which this editor can’t format`;
  return known.length > 0 ? `Markdown this editor can’t format, such as ${orList(known)}` : "Markdown this editor can’t format";
}

/**
 * The note over the editor when parts stay as written. It names only the
 * reasons that are in the document (HTML, footnotes, link definitions,
 * images), and stays general when the editor knows none.
 */
export function rawPartsNotice(count: number, kinds: readonly RawKind[]): string {
  const what = whatTheyUse(kinds);
  if (count === 1) return `One part uses ${what}. It stays exactly as written.`;
  return `${String(count)} parts use ${what}. They stay exactly as written.`;
}
