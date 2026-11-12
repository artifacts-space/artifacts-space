import type { JSONContent } from "@tiptap/core";

import { checkedList } from "./markdown-list-check";
import { freshList } from "./markdown-list-fresh";
import { isListNode, type ListSource } from "./markdown-list-items";
import type { LoadedMarkdown, SourceMap } from "./markdown-roundtrip";

/*
 * The list side of the round trip (markdown-roundtrip.ts): an edited list
 * written over its loaded source, a new list written so that it reads back,
 * and the spacing of an edited block inside an item. Kept apart so that the
 * round trip file stays short; it hands its own functions in as `ListTools`.
 */

/** What writing lists needs from the round trip. */
export interface ListTools {
  key: (node: JSONContent) => string;
  /** Editor nodes for Markdown, to compare only, or null when it does not parse. */
  parse: (markdown: string) => JSONContent[] | null;
  /** Schema-checked canonical nodes, or null. */
  canonical: (nodes: JSONContent[]) => JSONContent[] | null;
  /** One node as the editor's own writer writes it. */
  write: (node: JSONContent) => string;
  /** Markdown loaded as a document of its own. */
  load: (markdown: string) => LoadedMarkdown;
  /** Content written over the map it was loaded with. */
  save: (content: JSONContent[], map: SourceMap) => string;
}

/** The editor's own writing of the nodes, without the blank lines a renderer may add around them. */
export function ownWriting(manager: { serialize: (doc: JSONContent) => string }, nodes: JSONContent[]): string {
  return manager.serialize({ type: "doc", content: nodes }).replace(/^\n+|\n+$/g, "");
}

/** A piece of output: its text and the loaded block it is written over. */
interface OutputChunk {
  text: string;
  block: number;
}

/** An edited list written over its loaded block. */
export interface ListChunk extends OutputChunk {
  edited: true;
}

/** A list with no loaded source to keep, written so that it reads back as the list (markdown-list-fresh.ts). */
export function freshListText(node: JSONContent, tools: ListTools): string {
  return freshList(node, { render: tools.write, parse: tools.parse, canonical: tools.canonical, key: tools.key }).text;
}

/** Nodes as Markdown: a list on its own through `freshListText`, anything else as `write` has it. */
export function writtenNodes(nodes: JSONContent[], tools: ListTools, write: () => string): string {
  const [only] = nodes;
  return only && nodes.length === 1 && isListNode(only) ? freshListText(only, tools) : write();
}

/** An edited list written over its loaded list, when the result reads back as the same list. */
function composedList(node: JSONContent, list: ListSource<SourceMap>, tools: ListTools): string | null {
  return checkedList(node, list, {
    key: tools.key,
    parse: tools.parse,
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
 * previous block (or the one after that, when a block between was removed):
 * items nobody touched keep their source (markdown-list-items.ts).
 */
export function listChunk(nodes: JSONContent[], position: number, source: SourceMap, previous: number, used: ReadonlySet<number>, tools: ListTools): ListChunk | null {
  const node = nodes[position];
  if (!isListNode(node)) return null;
  for (const index of [previous + 1, previous + 2]) {
    const block = source.blocks[index];
    if (!block?.list || used.has(index) || block.list.type !== node.type || matchedLater(nodes, position, block.key, tools)) continue;
    const text = composedList(node, block.list, tools);
    return text === null ? null : { text, block: index, edited: true };
  }
  return null;
}

/** The map of a list item's content, when that Markdown loads as exactly the item's content. */
export function itemContentMap(markdown: string, item: JSONContent, tools: ListTools): SourceMap | null {
  const loaded = tools.load(markdown);
  if (loaded.rawBlocks > 0) return null;
  return tools.key({ content: loaded.doc.content ?? [] }) === tools.key({ content: item.content ?? [] }) ? { ...loaded.source, inItem: true } : null;
}

/**
 * Inside a list item, an edited block keeps the spacing it had, so a tight
 * item stays tight. Whether the item still reads the same is checked when
 * its list is written (`composedList`).
 */
export function spacingInItem(previous: OutputChunk, next: OutputChunk, source: SourceMap): string {
  const spacings = [source.blocks[previous.block]?.after, source.blocks[next.block - 1]?.after].filter((after) => after !== undefined);
  // With a block removed between two kept ones, the wider spacing keeps them apart.
  return spacings.reduce((wide, after) => (after.split("\n").length > wide.split("\n").length ? after : wide), spacings[0] ?? "\n\n");
}

/** A document loaded with Windows line ends (CRLF) on every line is saved with them; one that mixes line ends is saved with LF, as before. */
export function withLineEnds(markdown: string, original: string): string {
  const windows = original.includes("\r\n") && !/(?:^|[^\r])\n/.test(original);
  return windows ? markdown.replace(/\r?\n/g, "\r\n") : markdown;
}
