import type { JSONContent } from "@tiptap/core";

import { checkedList, type CheckedList } from "./markdown-list-check";
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
 *    the read view (markdown-list-check.ts), and stays a block of its own
 *    before the block written after it (`listsInContext`). Items nobody
 *    touched keep their bytes.
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
function composedList(node: JSONContent, list: ListSource<SourceMap>, tools: ListTools): CheckedList | null {
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
    const written = composedList(node, list, tools);
    return written === null ? null : { text: written.text, block: index, edited: true, list: { node, last: written.last } };
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

/** True when what stands between two blocks holds a blank line. */
function setApart(between: string): boolean {
  return /\n[ \t]*\n/.test(between);
}

const startsIndentedOrAsItem = /^(?:[ \t]|(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$))/;

/** What reading a written list with the block after it needs from the round trip. */
export interface ContextTools {
  /** What stands between two chunks in the written document. */
  between: (before: Chunk, chunk: Chunk) => string;
  /** The texts of the blocks the editor splits the Markdown into, or null. */
  blocks: (markdown: string) => string[] | null;
  /** One node as the round trip's own writer writes it. */
  write: (node: JSONContent) => string;
}

/**
 * The chunk after `position` when the list's last item changed and that
 * chunk could become part of it; null otherwise. A block set apart by a
 * blank line that starts at the start of its line, and not as a list item,
 * cannot join a list, and is not read.
 */
function joinableAfter(chunks: readonly Chunk[], position: number, tools: ContextTools): Chunk | null {
  const chunk = chunks[position];
  const after = chunks[position + 1];
  if (!chunk?.list?.last || !after) return null;
  return setApart(tools.between(chunk, after)) && !startsIndentedOrAsItem.test(after.text) ? null : after;
}

/**
 * True when the written list stays a block of its own before the block
 * after it: the editor splits the two, as the document will hold them, into
 * the same two blocks.
 *
 * Only the end of a list is read this way. An item written over its source
 * keeps its marker and how far in it sits, and a new item sits as far in as
 * the list's first, so the list starts as it did and the block before it
 * reads as it did. And only the editor is asked: where the read view takes
 * the next block into the list, the editor does too (both go by how far in
 * the block sits under the last item); no case was found where the read
 * view alone joins them.
 */
function standsAlone(chunks: readonly Chunk[], position: number, tools: ContextTools): boolean {
  const chunk = chunks[position];
  const after = joinableAfter(chunks, position, tools);
  if (!chunk || !after) return true;
  const split = tools.blocks(`${chunk.text}${tools.between(chunk, after)}${after.text}`);
  return split?.length === 2 && split[0] === chunk.text.replace(/\s+$/, "") && split[1] === after.text.replace(/\s+$/, "");
}

/**
 * The chunks as they are stored. A list written over its loaded items was
 * verified on its own; here it is read with the block after it, as the
 * document will hold them. When the list would take that block in (an item
 * added above an indented block does), the list is written whole by the
 * round trip's own writer instead.
 */
export function listsInContext(chunks: readonly Chunk[], tools: ContextTools): Chunk[] {
  const stored = [...chunks];
  chunks.forEach((chunk, position) => {
    if (chunk.list && !standsAlone(stored, position, tools)) stored[position] = { text: tools.write(chunk.list.node), block: -1 };
  });
  return stored;
}
