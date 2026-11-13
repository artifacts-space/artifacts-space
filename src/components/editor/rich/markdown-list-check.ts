import type { JSONContent } from "@tiptap/core";

import { readsTheSame } from "./markdown-display-shape";
import { composeList, type ListSource } from "./markdown-list-items";
import { itemNumber } from "./markdown-list-numbers";
import { endsDifferently, listRuns, type ListRun } from "./markdown-list-runs";
import { asStored } from "./markdown-meaning";

/** What checking a written list needs from the round trip. */
export interface ListCheckHelpers<Map> {
  key: (node: JSONContent) => string;
  /** Editor nodes for a block's Markdown, or null when it does not parse. */
  parse: (markdown: string) => JSONContent[] | null;
  /** The nodes as the editor reads them back from the round trip's own writing of them, or null. */
  writtenBack: (nodes: JSONContent[]) => JSONContent[] | null;
  /** Schema-checked canonical nodes, or null. */
  canonical: (nodes: JSONContent[]) => JSONContent[] | null;
  fresh: (node: JSONContent) => string;
  /** An item's content written over its map; `wide` puts a blank line around every edited block. */
  children: (content: JSONContent[], map: Map, wide: boolean) => string;
}

/** A list written over its loaded list and verified, and whether its last item changed. */
export interface CheckedList {
  text: string;
  last: boolean;
}

/** The run's items as a list of their own, numbered as the run's first item is written. */
function runList(node: JSONContent, run: ListRun): JSONContent {
  if (node.type !== "orderedList") return { ...node, content: run.items };
  return { ...node, attrs: { ...node.attrs, start: itemNumber(run.text) ?? 1 }, content: run.items };
}

/** True when the two contents are the same as Markdown can store them (markdown-meaning.ts): a space typed at the end of an item is not a difference. */
function sameStored<Map>(one: JSONContent[], other: JSONContent[], helpers: ListCheckHelpers<Map>): boolean {
  if (helpers.key({ content: one }) === helpers.key({ content: other })) return true;
  return helpers.key({ content: asStored(one) }) === helpers.key({ content: asStored(other) });
}

function itemCount(list: JSONContent): number {
  return (list.content ?? []).length;
}

/** The list with only its first `count` items. */
function firstItems(list: JSONContent, count: number): JSONContent {
  return { ...list, content: (list.content ?? []).slice(0, count) };
}

/**
 * True when the items would load formatted again. A block loads formatted
 * only when the editor reads the round trip's own writing of its nodes back
 * as exactly those nodes (markdown-roundtrip.ts); the list passed that when
 * it loaded, and here the items of the run pass it.
 */
function loadsFormatted<Map>(list: JSONContent, compared: number, helpers: ListCheckHelpers<Map>): boolean {
  const back = helpers.writtenBack([list]) ?? [];
  const [read] = back;
  if (back.length !== 1 || !read || itemCount(read) !== itemCount(list)) return false;
  return helpers.key(firstItems(read, compared)) === helpers.key(firstItems(list, compared));
}

/**
 * True when a run of written items reads back as the edit: the editor reads
 * its text as the edited items (both taken as Markdown can store them), the
 * items would load formatted again, and the read view (remark) reads the
 * text as the editor does.
 */
function runReadsBack<Map>(node: JSONContent, run: ListRun, helpers: ListCheckHelpers<Map>): boolean {
  const expected = helpers.canonical([runList(node, run)]);
  const again = helpers.parse(run.text);
  if (!expected || !again || !sameStored(again, expected, helpers)) return false;
  return loadsFormatted(again[0] ?? {}, run.compared, helpers) && readsTheSame(run.text, again);
}

function attempt<Map>(node: JSONContent, list: ListSource<Map>, wide: boolean, helpers: ListCheckHelpers<Map>): CheckedList | null {
  const composed = composeList(node, list, {
    key: helpers.key,
    children: (content, map) => helpers.children(content, map, wide),
    fresh: helpers.fresh,
  });
  if (!composed?.parts.length) return null;
  if (!listRuns(composed, list).every((run) => runReadsBack(node, run, helpers))) return null;
  return { text: composed.text, last: endsDifferently(composed, list) };
}

/**
 * An edited list written over its loaded list (markdown-list-items.ts), kept
 * only when it is verified to read back as the edit. Only what the edit can
 * affect is read again: the items written differently and the ones beside
 * them (markdown-list-runs.ts), in the editor and in the read view. The
 * block after the list is the caller's to check, when `last` says the
 * list's end changed.
 *
 * An edited block inside an item first keeps the spacing it had; when that
 * does not verify, every edited block gets blank lines around it. Null when
 * neither verifies, or when the list itself changed (the number it starts
 * at): the caller then writes the list whole with the round trip's own
 * writer, and nothing else.
 */
export function checkedList<Map>(node: JSONContent, list: ListSource<Map>, helpers: ListCheckHelpers<Map>): CheckedList | null {
  if (helpers.key({ ...node, content: [] }) !== list.shell) return null;
  return attempt(node, list, false, helpers) ?? attempt(node, list, true, helpers);
}
