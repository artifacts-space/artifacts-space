/*
 * Numbers in a numbered list's source. When an edit adds, removes, or moves
 * items, the list is numbered again as a fresh save would number it, so the
 * stored text never shows "1. 3. 4.": from the list's start, one up per
 * item, or the one number every item had (`1.` on each item stays so). The
 * delimiter (`.` or `)`) and the items' own text stay as written.
 */

/** The written number of an item's first line, or null. */
export function itemNumber(text: string): number | null {
  const digits = /^ *(\d+)[.)]/.exec(text)?.[1];
  return digits === undefined ? null : Number(digits);
}

/** The one number every item has, when there are two or more items and they all share it. */
export function sharedNumber(texts: readonly string[]): number | null {
  const numbers = new Set(texts.map((text) => itemNumber(text)));
  const [only] = numbers;
  return texts.length > 1 && numbers.size === 1 && typeof only === "number" ? only : null;
}

/** A line moved right or left by `delta` spaces, never past its text. */
function shifted(line: string, delta: number): string {
  if (!line || delta === 0) return line;
  if (delta > 0) return `${" ".repeat(delta)}${line}`;
  const spaces = /^ */.exec(line)?.[0].length ?? 0;
  return line.slice(Math.min(spaces, -delta));
}

/** The item with `number` in place of its own; its other lines move with the marker's width. */
export function withNumber(text: string, number: number): string {
  const match = /^( *)(\d+)(?=[.)])/.exec(text);
  if (!match) return text;
  const digits = String(number);
  const delta = digits.length - (match[2]?.length ?? 0);
  const [first = "", ...rest] = text.split("\n");
  return [`${match[1] ?? ""}${digits}${first.slice(match[0].length)}`, ...rest.map((line) => shifted(line, delta))].join("\n");
}

/** The items numbered again: the shared number when the loaded list had one, else from `start` up. */
export function renumbered(texts: readonly string[], loaded: readonly string[], start: number): string[] {
  const shared = sharedNumber(loaded);
  return texts.map((text, position) => withNumber(text, shared ?? start + position));
}
