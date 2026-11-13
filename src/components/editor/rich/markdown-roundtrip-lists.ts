import type { JSONContent } from "@tiptap/core";

import { checkedList } from "./markdown-list-check";
import { isListNode, type ListSource } from "./markdown-list-items";
import type { LoadedMarkdown, SourceMap } from "./markdown-roundtrip";
import type { Chunk } from "./markdown-roundtrip-output";
import { asStored } from "./markdown-meaning";

/*
 * The list side of the round trip (markdown-roundtrip.ts). An edited list
 * is saved in one of two ways, and no other:
 *
 * 1. Over its loaded source, item by item (markdown-list-items.ts), when
 *    that text is verified to read back as the edit in the editor and in
 *    the read view (markdown-list-check.ts). Items nobody touched keep
 *    their bytes.
 * 2. Otherwise by the round trip's own writer, whole, as any other edited
 *    block is and as lists were before item maps existed. Nothing stands
 *    between a list and this writer: no check can refuse it.
 */

/** What writing lists needs from the round trip. */
export interface ListTools {
  key: (node: JSONContent) => string;
  /** Editor nodes for a block's Markdown, or null when it does not parse. */
  parse: (markdown: string) => JSONContent[] | null;
  /** The nodes as the editor reads them back from the round trip's own writing of them, or null. */
  writtenBack: (nodes: JSONContent[]) => JSONContent[] | null;
  /** Schema-checked canonical nodes, or null. */
  canonical: (nodes: JSONContent[]) => JSONContent[] | null;
  /** One node as the round trip's own writer writes it. */
  write: (node: JSONContent) => string;
  /** Markdown loaded as a document of its own. */
  load: (markdown: string) => LoadedMarkdown;
  /** Content written over the map it was loaded with. */
  save: (content: JSONContent[], map: SourceMap) => string;
}

/** An edited list written over its loaded list, when the result reads back as the same list. */
function composedList(node: JSONContent, list: ListSource<SourceMap>, tools: ListTools): string | null {
  return checkedList(node, list, {
    key: tools.key,
    parse: tools.parse,
    writtenBack: tools.writtenBack,
    canonical: tools.canonical,
    fresh: tools.write,
    children: (content, map, wide) => tools.save(content, wide ? { ...map, inItem: false } : map),
  });
}

/** True when a later node still matches the block as loaded, so the block is not the one edited here. */
function matchedLater(nodes: JSONContent[], position: number, key: string, tools: ListTools): boolean {
  return nodes.slice(position + 1).some((node) => tools.key({ content: [node] }) === key);
}

/**
 * An edited list at `position`, written over the loaded list just after the
 * previous block (or the one after that, when a block between was removed).
 * Null when the node is not a list, has no loaded list to be written over,
 * or the text written that way does not read back as the edit: the caller
 * then writes the node whole, with the round trip's own writer.
 */
export function listChunk(nodes: JSONContent[], position: number, source: SourceMap, previous: number, used: ReadonlySet<number>, tools: ListTools): Chunk | null {
  const node = nodes[position];
  if (!isListNode(node)) return null;
  for (const index of [previous + 1, previous + 2]) {
    const list = used.has(index) ? null : loadedList(source, index, node);
    if (!list || matchedLater(nodes, position, source.blocks[index]?.key ?? "", tools)) continue;
    const text = composedList(node, list, tools);
    return text === null ? null : { text, block: index, edited: true };
  }
  return null;
}

/** The loaded list at `index`, item by item, when it is a list of the node's type. */
function loadedList(source: SourceMap, index: number, node: JSONContent): ListSource<SourceMap> | null {
  const list = source.blocks[index]?.list?.() ?? null;
  return list?.type === node.type ? list : null;
}

/**
 * The map of a list item's content, when that Markdown loads as the item's
 * content. A paragraph that ends in spaces inside its item loads without
 * them here, so the two are compared as Markdown can store them, and each
 * block of the map takes the key of the item's own nodes: a block nobody
 * edits then matches, and keeps its bytes.
 */
export function itemContentMap(markdown: string, item: JSONContent, tools: ListTools): SourceMap | null {
  const loaded = tools.load(markdown);
  const content = item.content ?? [];
  if (loaded.rawBlocks > 0 || tools.key({ content: asStored(loaded.doc.content ?? []) }) !== tools.key({ content: asStored(content) })) return null;
  let offset = 0;
  const blocks = loaded.source.blocks.map((block) => {
    const nodes = content.slice(offset, offset + block.nodeCount);
    offset += block.nodeCount;
    return { ...block, key: tools.key({ content: nodes }) };
  });
  return { ...loaded.source, blocks, inItem: true };
}
