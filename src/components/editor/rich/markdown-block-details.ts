import type { JSONContent } from "@tiptap/core";

import { rawBlockKind, type RawKind, type SourceBlock } from "./markdown-blocks";
import { mayReadDifferently, readsTheSame } from "./markdown-display-shape";
import { isListNode, splitListItems, type ListSource } from "./markdown-list-items";
import { RAW_MARKDOWN } from "./raw-markdown-node";

export type { RawKind } from "./markdown-blocks";

/** A loaded block, as the round trip maps it: its key, how many nodes it became, its source, and its items when it is a list. */
export interface DetailedBlock<Map> {
  key: string;
  nodeCount: number;
  text: string;
  list?: ListSource<Map>;
}

/** What reviewing the blocks needs from the round trip. */
export interface BlockDetailHelpers<Map> {
  key: (node: JSONContent) => string;
  /** The raw node that keeps `text` as written. */
  rawNode: (text: string) => JSONContent;
  /** The source map of an item's content when it loads as exactly `item`'s content; null otherwise. */
  itemContent: (markdown: string, item: JSONContent) => Map | null;
  /** Link reference definitions, read with each block. */
  definitions: string;
}

/** A value made on first use, then kept. */
function once<T>(make: () => T): () => T {
  let made: { value: T } | null = null;
  return () => {
    made ??= { value: make() };
    return made.value;
  };
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
      return { ...slice, key: helpers.key(item), children: once(() => helpers.itemContent(slice.content, item)) };
    }),
  };
}

/** Each kind once, in the order first seen. */
function addKind(kinds: RawKind[], kind: RawKind) {
  if (!kinds.includes(kind)) kinds.push(kind);
}

/** True when the read view would show the block's lists differently from the editor. */
function readsDifferently(block: DetailedBlock<unknown>, nodes: readonly JSONContent[], definitions: string): boolean {
  if (!mayReadDifferently(block.text)) return false;
  return !readsTheSame(definitions ? `${block.text}\n\n${definitions}` : block.text, nodes);
}

/** What reviewing found: blocks now kept as written, and why parts are kept as written. */
export interface BlockReview {
  addedRaw: number;
  rawKinds: RawKind[];
}

/**
 * Reviews the loaded blocks in place. A block with list syntax that the read
 * view would show differently is kept as written instead, so the editor never
 * shows or saves a list the page draws another way. List blocks get item maps,
 * so an edit to one item leaves the others as written.
 */
export function reviewBlocks<Map>(sources: readonly SourceBlock[], blocks: DetailedBlock<Map>[], content: JSONContent[], helpers: BlockDetailHelpers<Map>): BlockReview {
  const review: BlockReview = { addedRaw: 0, rawKinds: [] };
  let offset = 0;
  blocks.forEach((block, index) => {
    const nodes = content.slice(offset, offset + block.nodeCount);
    if (nodes[0]?.type === RAW_MARKDOWN) addKind(review.rawKinds, rawBlockKind(sources[index]?.token) ?? "other");
    else if (readsDifferently(block, nodes, helpers.definitions)) keepAsWritten(block, offset, content, helpers, review);
    else if (block.nodeCount === 1 && isListNode(nodes[0])) attachList(block, nodes[0], helpers);
    offset += block.nodeCount;
  });
  return review;
}

function keepAsWritten<Map>(block: DetailedBlock<Map>, offset: number, content: JSONContent[], helpers: BlockDetailHelpers<Map>, review: BlockReview) {
  const raw = helpers.rawNode(block.text);
  content.splice(offset, block.nodeCount, raw);
  block.nodeCount = 1;
  block.key = helpers.key({ content: [raw] });
  review.addedRaw += 1;
  addKind(review.rawKinds, "other");
}

function attachList<Map>(block: DetailedBlock<Map>, node: JSONContent, helpers: BlockDetailHelpers<Map>) {
  const list = listSource(block.text, node, helpers);
  if (list) block.list = list;
}
