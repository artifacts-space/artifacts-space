import type { JSONContent } from "@tiptap/core";

import type { ComposedList, ListSource, Part } from "./markdown-list-items";

/*
 * What an edit to a list can affect. Both readers read a list item by item:
 * where an item ends depends on its own lines and on the line that starts
 * the next item, and what an item holds depends on its own lines alone
 * (markdown-schema.ts reads every line of text in an item as a paragraph,
 * so not even on how the other items are spaced). So after an edit, only
 * the items written differently and the ones beside them need to be read
 * again: a run of items. An item nobody edited, between the neighbours it
 * loaded with, reads as it did when the list loaded.
 */

/** Items that follow each other in a written list, to be read again as a list of their own. */
export interface ListRun {
  /** The items as written, with what stands between them. */
  text: string;
  items: JSONContent[];
  /**
   * How many of the items are compared exactly. The last item of a run that
   * stops before the list's end is there only as what follows an edited
   * item; as the last item of a list it would lose the spaces that end it.
   */
  compared: number;
}

/** True when the two parts are loaded items nobody edited that followed each other in the loaded list. */
function together(before: Part, part: Part): boolean {
  return before.exact && part.exact && part.index === before.index + 1;
}

const bareMarker = /^\s*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?[ \t]*$/;

/** True for an item with no text on its marker's line: a list cannot always start with one, so a run never does. */
function startsBare(part: Part): boolean {
  return bareMarker.test(part.text.split("\n", 1)[0] ?? "");
}

/**
 * Which parts are read again: every part with a neighbour it did not load
 * beside or that was edited itself, the first part when it was not the
 * list's first, and the last when it was not the last.
 */
function unsettled(parts: readonly Part[], list: ListSource<unknown>): boolean[] {
  const flags = parts.map((part) => !part.exact);
  parts.forEach((part, position) => {
    const before = parts[position - 1];
    if (!before || together(before, part)) return;
    flags[position - 1] = true;
    flags[position] = true;
  });
  if (parts[0] && parts[0].index !== 0) flags[0] = true;
  if (parts.length > 0 && parts.at(-1)?.index !== list.items.length - 1) flags[parts.length - 1] = true;
  for (let position = parts.length - 1; position > 0; position -= 1) {
    const part = parts[position];
    if (flags[position] && part && startsBare(part)) flags[position - 1] = true;
  }
  return flags;
}

function runOf(composed: ComposedList, from: number, to: number): ListRun {
  const parts = composed.parts.slice(from, to + 1);
  const text = parts.map((part, offset) => `${offset === 0 ? "" : (composed.separators[from + offset] ?? "")}${part.text}`).join("");
  return { text, items: parts.map((part) => part.item), compared: to < composed.parts.length - 1 ? parts.length - 1 : parts.length };
}

/** The runs of items an edit can have changed the reading of, in the order written. */
export function listRuns(composed: ComposedList, list: ListSource<unknown>): ListRun[] {
  const flags = unsettled(composed.parts, list);
  const runs: ListRun[] = [];
  let from = -1;
  flags.forEach((flag, position) => {
    if (flag && from < 0) from = position;
    if (from >= 0 && (!flag || position === flags.length - 1)) {
      runs.push(runOf(composed, from, flag ? position : position - 1));
      from = -1;
    }
  });
  return runs;
}

/**
 * True when the written list's last item is not the loaded last item,
 * written as it loaded: then the block after the list can read differently
 * too. A new number counts: `10.` becoming `9.` sets the item's text one
 * column further out, and a block below can then fall inside it.
 */
export function endsDifferently(composed: ComposedList, list: ListSource<unknown>): boolean {
  const last = composed.parts.at(-1);
  const loaded = list.items.at(-1);
  return !last?.exact || last.index !== list.items.length - 1 || last.text !== loaded?.text;
}
