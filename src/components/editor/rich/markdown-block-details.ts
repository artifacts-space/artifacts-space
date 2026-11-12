import type { JSONContent } from "@tiptap/core";

import { rawBlockKind, type RawKind, type SourceBlock } from "./markdown-blocks";
import { isListNode, splitListItems, type ListSource } from "./markdown-list-items";
import { RAW_MARKDOWN } from "./raw-markdown-node";

export type { RawKind } from "./markdown-blocks";

/** A loaded block, as the round trip maps it: how many nodes it became, its source, and its items when it is a list. */
export interface DetailedBlock<Map> {
  nodeCount: number;
  text: string;
  list?: ListSource<Map>;
}

/** What describing the blocks needs from the round trip. */
export interface BlockDetailHelpers<Map> {
  key: (node: JSONContent) => string;
  /** The source map of an item's content when it loads as exactly `item`'s content; null otherwise. */
  itemContent: (markdown: string, item: JSONContent) => Map | null;
}

/** A list block's items, each with its source and content map; null when the source cannot be cut into the node's items. */
function listSource<Map>(text: string, node: JSONContent, helpers: BlockDetailHelpers<Map>): ListSource<Map> | null {
  const slices = splitListItems(text);
  const items = node.content ?? [];
  if (slices?.length !== items.length || !node.type) return null;
  return {
    type: node.type,
    items: slices.map((slice, index) => {
      const item = items[index] ?? {};
      return { ...slice, key: helpers.key(item), children: helpers.itemContent(slice.content, item) };
    }),
  };
}

/** Each kind once, in the order first seen. */
function addKind(kinds: RawKind[], kind: RawKind) {
  if (!kinds.includes(kind)) kinds.push(kind);
}

/**
 * Adds item maps to loaded list blocks, so an edit to one item leaves the
 * others as written, and returns why the raw blocks stay as written, each
 * reason once.
 */
export function describeBlocks<Map>(sources: readonly SourceBlock[], blocks: DetailedBlock<Map>[], content: readonly JSONContent[], helpers: BlockDetailHelpers<Map>): RawKind[] {
  const kinds: RawKind[] = [];
  let offset = 0;
  blocks.forEach((block, index) => {
    const node = content[offset];
    offset += block.nodeCount;
    if (node?.type === RAW_MARKDOWN) addKind(kinds, rawBlockKind(sources[index]?.token) ?? "other");
    if (block.nodeCount !== 1 || !isListNode(node)) return;
    const list = listSource(block.text, node, helpers);
    if (list) block.list = list;
  });
  return kinds;
}
