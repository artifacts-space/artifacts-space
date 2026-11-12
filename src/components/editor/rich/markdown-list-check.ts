import type { JSONContent } from "@tiptap/core";

import { readsTheSame } from "./markdown-display-shape";
import { itemNumber } from "./markdown-list-numbers";
import { composeList, type ListSource } from "./markdown-list-items";

/** What checking a written list needs from the round trip. */
export interface ListCheckHelpers<Map> {
  key: (node: JSONContent) => string;
  /** Editor nodes for Markdown, or null when it does not parse. */
  parse: (markdown: string) => JSONContent[] | null;
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

/** True when the editor reads the text back as exactly `expected`. */
function editorReadsSame<Map>(text: string, expected: JSONContent[], helpers: ListCheckHelpers<Map>): boolean {
  const again = helpers.parse(text);
  return again !== null && helpers.key({ content: again }) === helpers.key({ content: expected });
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
  if (!composed || !editorReadsSame(composed.text, expected, helpers)) return null;
  return itemsReadSame(node, composed.changed, helpers) ? composed.text : null;
}

/**
 * An edited list written over its loaded list (markdown-list-items.ts), kept
 * only when it reads back the same: the editor reads the whole list as the
 * edited node, and the read view (remark) shows every item written anew as
 * the editor holds it. An edited block inside an item first keeps the
 * spacing it had; when that reads differently, every edited block gets blank
 * lines around it. Null when neither reads the same: the list is then
 * written fresh.
 */
export function checkedList<Map>(node: JSONContent, list: ListSource<Map>, helpers: ListCheckHelpers<Map>): string | null {
  const expected = helpers.canonical([node]);
  if (!expected) return null;
  return attempt(node, list, expected, false, helpers) ?? attempt(node, list, expected, true, helpers);
}
