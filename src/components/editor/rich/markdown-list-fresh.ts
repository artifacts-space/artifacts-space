import type { JSONContent } from "@tiptap/core";

import { readsTheSame } from "./markdown-display-shape";
import { isListNode } from "./markdown-list-items";

/*
 * A list written fresh, with nothing kept from its source. The editor's own
 * writer packs blocks tight, and in a few nested shapes (a quote right above
 * a list, a paragraph right under code) the text then reads as something
 * else. So a fresh list is read back by the editor and by the read view; when
 * it reads differently, the list is written again with every block on lines
 * of its own, which Markdown reads only one way.
 */

/** What writing a fresh list needs from the round trip. */
export interface FreshListHelpers {
  /** One node as the editor's writer writes it. */
  render: (node: JSONContent) => string;
  /** Editor nodes for Markdown, or null when it does not parse. */
  parse: (markdown: string) => JSONContent[] | null;
  /** Schema-checked canonical nodes, or null. */
  canonical: (nodes: JSONContent[]) => JSONContent[] | null;
  key: (node: JSONContent) => string;
}

function itemMarker(list: JSONContent, item: JSONContent, position: number): string {
  if (list.type === "taskList") return item.attrs?.checked === true ? "- [x]" : "- [ ]";
  if (list.type !== "orderedList") return "-";
  const start: unknown = list.attrs?.start;
  return `${String((typeof start === "number" ? start : 1) + position)}.`;
}

/** How far an item's other lines sit in: under the text for a bullet or number, under the box's bracket for a task. */
function itemIndent(list: JSONContent, marker: string): number {
  return list.type === "taskList" ? 2 : marker.length + 1;
}

function wideItem(list: JSONContent, item: JSONContent, position: number, helpers: FreshListHelpers): string {
  const marker = itemMarker(list, item, position);
  const pad = " ".repeat(itemIndent(list, marker));
  const blocks = (item.content ?? []).map((block) => (isListNode(block) ? wideList(block, helpers) : helpers.render(block)));
  const [first = "", ...rest] = blocks.filter((block) => block !== "").join("\n\n").split("\n");
  return [`${marker} ${first}`.trimEnd(), ...rest.map((line) => (line ? `${pad}${line}` : ""))].join("\n");
}

/**
 * The list with a blank line between the blocks inside its items, and
 * between the items too, except in a task list: the editor reads task items
 * with a blank line between them as two lists.
 */
export function wideList(list: JSONContent, helpers: FreshListHelpers): string {
  const between = list.type === "taskList" ? "\n" : "\n\n";
  return (list.content ?? []).map((item, position) => wideItem(list, item, position, helpers)).join(between);
}

/** True when the editor and the read view both read `text` as `node`. */
function readsBack(text: string, expected: JSONContent[], helpers: FreshListHelpers): boolean {
  const again = helpers.parse(text);
  return again !== null && helpers.key({ content: again }) === helpers.key({ content: expected }) && readsTheSame(text, expected);
}

/** A freshly written list, and whether both readers read it back as the list. */
export interface FreshList {
  text: string;
  sound: boolean;
}

/**
 * A list written fresh: the editor's own writing when it reads back as the
 * list, else the wide form when that does. When neither does, the editor's
 * own writing stands, as before this check existed, and `sound` is false.
 */
export function freshList(list: JSONContent, helpers: FreshListHelpers): FreshList {
  const tight = helpers.render(list);
  const expected = helpers.canonical([list]);
  if (!expected) return { text: tight, sound: false };
  if (readsBack(tight, expected, helpers)) return { text: tight, sound: true };
  const wide = wideList(list, helpers);
  return readsBack(wide, expected, helpers) ? { text: wide, sound: true } : { text: tight, sound: false };
}
