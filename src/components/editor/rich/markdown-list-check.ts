import type { JSONContent } from "@tiptap/core";

import { mayReadDifferently, readsTheSame } from "./markdown-display-shape";
import { asStored } from "./markdown-meaning";
import { itemNumber } from "./markdown-list-numbers";
import { composeList, type ListSource } from "./markdown-list-items";

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

/** The list holding only `item`, numbered as the item is written. */
function soloList(node: JSONContent, item: JSONContent, text: string): JSONContent {
  if (node.type !== "orderedList") return { ...node, content: [item] };
  return { ...node, attrs: { ...node.attrs, start: itemNumber(text) ?? 1 }, content: [item] };
}

/** True when the two contents are the same as Markdown can store them (markdown-meaning.ts): a space typed at the end of an item is not a difference. */
function sameStored<Map>(one: JSONContent[], other: JSONContent[], helpers: ListCheckHelpers<Map>): boolean {
  if (helpers.key({ content: one }) === helpers.key({ content: other })) return true;
  return helpers.key({ content: asStored(one) }) === helpers.key({ content: asStored(other) });
}

/** Some of a list's items as a list of their own, and how many of them are compared. */
interface ListPart {
  list: JSONContent;
  compared: number;
}

/**
 * The items at `changed` and the ones beside them, as a list of their own,
 * numbered as they are in `list`. When the last of them is not the list's
 * last item, it is there only as what follows an edited item: as the last
 * item of a list it would lose the spaces that end it, so it is not compared.
 */
function neighbourhood(list: JSONContent, changed: readonly number[]): ListPart {
  const items = list.content ?? [];
  const wanted = new Set(changed.flatMap((position) => [position - 1, position, position + 1]));
  const first = Math.max(0, Math.min(...wanted));
  const content = items.filter((_item, position) => wanted.has(position));
  const compared = wanted.has(items.length) ? content.length : content.length - 1;
  if (list.type !== "orderedList" || first === 0) return { list: { ...list, content }, compared };
  const start = typeof list.attrs?.start === "number" ? list.attrs.start : 1;
  return { list: { ...list, attrs: { ...list.attrs, start: start + first }, content }, compared };
}

function itemCount(list: JSONContent): number {
  return (list.content ?? []).length;
}

/** The list with only its first `count` items. */
function firstItems(list: JSONContent, count: number): JSONContent {
  return { ...list, content: (list.content ?? []).slice(0, count) };
}

/**
 * True when the list would load formatted again. A block loads formatted
 * only when the editor reads the round trip's own writing of its nodes back
 * as exactly those nodes (markdown-roundtrip.ts), and the list passed that
 * when it loaded. A list with items added, removed, or moved is asked
 * again, whole. A list with every item still in its place is asked only
 * about the items written differently and the ones beside them: items are
 * written and read one by one, so nothing else about the list has changed.
 */
function loadsFormatted<Map>(list: JSONContent, changedInPlace: readonly number[] | null, helpers: ListCheckHelpers<Map>): boolean {
  if (changedInPlace?.length === 0) return true;
  const part = changedInPlace === null ? { list, compared: itemCount(list) } : neighbourhood(list, changedInPlace);
  const back = helpers.writtenBack([part.list]) ?? [];
  const [read] = back;
  if (back.length !== 1 || !read || itemCount(read) !== itemCount(part.list)) return false;
  return helpers.key(firstItems(read, part.compared)) === helpers.key(firstItems(part.list, part.compared));
}

/** True when the read view shows each changed item as the editor holds it. */
function itemsReadSame<Map>(node: JSONContent, changed: readonly { text: string; item: JSONContent }[], helpers: ListCheckHelpers<Map>): boolean {
  return changed.every(({ text, item }) => {
    const solo = helpers.canonical([soloList(node, item, text)]);
    return solo !== null && readsTheSame(text, solo);
  });
}

function attempt<Map>(node: JSONContent, list: ListSource<Map>, expected: JSONContent[], wide: boolean, helpers: ListCheckHelpers<Map>): string | null {
  const composed = composeList(node, list, {
    key: helpers.key,
    children: (content, map) => helpers.children(content, map, wide),
    fresh: helpers.fresh,
  });
  if (!composed) return null;
  const again = helpers.parse(composed.text);
  if (!again || !sameStored(again, expected, helpers)) return null;
  if (!loadsFormatted(again[0] ?? {}, composed.changedInPlace, helpers) || !itemsReadSame(node, composed.changed, helpers)) return null;
  // An item can read one way alone and another among its neighbours, in the shapes the two readers are known to read differently.
  return mayReadDifferently(composed.text) && !readsTheSame(composed.text, again) ? null : composed.text;
}

/**
 * An edited list written over its loaded list (markdown-list-items.ts), kept
 * only when it is verified to read back as the edit:
 *
 * 1. the editor reads the whole text as the edited list, both taken as
 *    Markdown can store them;
 * 2. the list would load formatted again (`loadsFormatted`);
 * 3. the read view (remark) shows every item written anew as the editor
 *    holds it, and the whole list too when it has a shape the two readers
 *    are known to read differently.
 *
 * An edited block inside an item first keeps the spacing it had; when that
 * does not verify, every edited block gets blank lines around it. Null when
 * neither verifies: the caller then writes the list whole with the round
 * trip's own writer, and nothing else.
 */
export function checkedList<Map>(node: JSONContent, list: ListSource<Map>, helpers: ListCheckHelpers<Map>): string | null {
  const expected = helpers.canonical([node]);
  if (!expected) return null;
  return attempt(node, list, expected, false, helpers) ?? attempt(node, list, expected, true, helpers);
}
