import type { JSONContent } from "@tiptap/core";

import { checkedList } from "./markdown-list-check";
import { readsTheSame } from "./markdown-display-shape";
import { freshList, wideList, type FreshList, type FreshListHelpers, type ReadViewCheck } from "./markdown-list-fresh";
import { isListNode, type ListSource } from "./markdown-list-items";
import type { LoadedMarkdown, SourceMap } from "./markdown-roundtrip";
import { joinedChunks, type Chunk } from "./markdown-roundtrip-output";

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

function freshHelpers(tools: ListTools): FreshListHelpers {
  return { render: tools.write, parse: tools.parse, canonical: tools.canonical, key: tools.key };
}

/** A list with no loaded source to keep, written so that it reads back as the list (markdown-list-fresh.ts). */
function freshListOf(node: JSONContent, tools: ListTools, readView: ReadViewCheck): FreshList {
  return freshList(node, freshHelpers(tools), readView);
}

/**
 * Nodes as Markdown, for a block's check when it loads and for a comment:
 * lists are written fresh, each on its own (a Markdown list of task and
 * plain items is several lists in the editor), anything else as `write` has
 * it. A document's saved lists go through `listChunk` and `checkedListRuns`,
 * which never save a list that reads back differently.
 */
export function writtenNodes(nodes: JSONContent[], tools: ListTools, write: () => string): string {
  if (nodes.length === 0 || !nodes.every((node) => isListNode(node))) return write();
  return nodes.map((node) => freshListOf(node, tools, "known shapes").text).join("\n\n");
}

const listParts: ReadonlySet<string> = new Set(["bulletList", "orderedList", "taskList", "listItem", "taskItem"]);

/** The blocks inside a list, in order, without the lists and items around them. */
function blocksOf(node: JSONContent): JSONContent[] {
  return listParts.has(node.type ?? "") ? (node.content ?? []).flatMap(blocksOf) : [node];
}

/** The list's blocks as blocks of their own: every word and code line kept, the list left out. */
function withoutTheList(node: JSONContent, tools: ListTools): string {
  return blocksOf(node).map((block) => tools.write(block)).filter((text) => text !== "").join("\n\n");
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
 * The loaded list the node at `position` is an edit of: the block just after
 * the previous one, or the one after that when a block between was removed.
 * -1 when there is none.
 */
function loadedListAt(nodes: JSONContent[], position: number, source: SourceMap, previous: number, used: ReadonlySet<number>, tools: ListTools): number {
  const type = nodes[position]?.type;
  return [previous + 1, previous + 2].find((index) => {
    const block = source.blocks[index];
    return block?.list !== undefined && !used.has(index) && block.list.type === type && !matchedLater(nodes, position, block.key, tools);
  }) ?? -1;
}

/**
 * The list at `position` as it is saved, or null when the node is not a
 * list. Each step is taken only when the one before reads back differently
 * in the editor or in the read view:
 *
 * 1. Over its loaded list: items nobody touched keep their source
 *    (markdown-list-items.ts, checked in markdown-list-check.ts).
 * 2. Fresh, as the editor's writer has it, or with every block on lines of
 *    its own (markdown-list-fresh.ts).
 * 3. The last resort, which no generated edit reaches
 *    (markdown-list-fuzz.test.ts): an edited list stays as it was loaded,
 *    so this save leaves the edit to that list out; a list with nothing
 *    loaded is saved as its blocks without the list. Markdown that reads
 *    back as a structure the person did not see is never saved.
 */
export function listChunk(nodes: JSONContent[], position: number, source: SourceMap, previous: number, used: ReadonlySet<number>, tools: ListTools): Chunk | null {
  const node = nodes[position];
  if (!isListNode(node)) return null;
  const index = loadedListAt(nodes, position, source, previous, used, tools);
  const loaded = source.blocks[index];
  const composed = loaded?.list ? composedList(node, loaded.list, tools) : null;
  if (composed !== null) return { text: composed, block: index, edited: true, nodes: [node] };
  const fresh = freshListOf(node, tools, "always");
  if (fresh.sound) return { text: fresh.text, block: -1, nodes: [node] };
  return loaded ? { text: loaded.text, block: index } : { text: withoutTheList(node, tools), block: -1 };
}

/** Lists that sit next to each other and have one type, as one list: Markdown reads them as one. */
function joinedLists(nodes: readonly JSONContent[]): JSONContent[] {
  const joined: JSONContent[] = [];
  for (const node of nodes) {
    const last = joined.at(-1);
    if (last && last.type === node.type && isListNode(node)) joined[joined.length - 1] = { ...last, content: [...(last.content ?? []), ...(node.content ?? [])] };
    else joined.push(node);
  }
  return joined;
}

/** True when the editor and the read view both read `text` as the lists. */
function runReadsBack(text: string, lists: JSONContent[], tools: ListTools): boolean {
  const expected = tools.canonical(lists);
  const again = tools.parse(text);
  if (!expected || !again) return false;
  return tools.key({ content: joinedLists(again) }) === tools.key({ content: joinedLists(expected) }) && readsTheSame(text, expected);
}

/** True for a chunk that writes lists and nothing else. */
function writesLists(chunk: Chunk | undefined): boolean {
  const nodes = chunk?.nodes ?? [];
  return nodes.length > 0 && nodes.every((node) => isListNode(node));
}

const listTypes: ReadonlySet<string> = new Set(["bulletList", "orderedList", "taskList"]);

/** True for a loaded block that held lists and nothing else; its key is its nodes as JSON. */
function heldLists(key: string): boolean {
  const parsed: unknown = JSON.parse(key);
  const content: unknown = typeof parsed === "object" && parsed !== null && "content" in parsed ? parsed.content : null;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((node: unknown) => typeof node === "object" && node !== null && "type" in node && listTypes.has(String(node.type)));
}

/**
 * The loaded blocks a run of lists stands in for, as they were loaded: the
 * blocks between the loaded block written before the run and the one written
 * after it. Null when there are none, when one of them held something other
 * than lists, or when one is written elsewhere in the document.
 */
function asLoaded(chunks: readonly Chunk[], from: number, to: number, source: SourceMap): Chunk[] | null {
  const before = chunks.slice(0, from).findLast((chunk) => chunk.block >= 0)?.block ?? -1;
  const after = chunks.slice(to).find((chunk) => chunk.block >= 0)?.block ?? source.blocks.length;
  const elsewhere = new Set([...chunks.slice(0, from), ...chunks.slice(to)].map((chunk) => chunk.block));
  const kept: Chunk[] = [];
  for (let index = before + 1; index < after; index += 1) {
    const block = source.blocks[index];
    if (!block || elsewhere.has(index) || !heldLists(block.key)) return null;
    kept.push({ text: block.text, block: index });
  }
  return kept.length > 0 ? kept : null;
}

/**
 * A run of lists written one after another, as it is saved. Markdown reads
 * lists that follow each other as one list (task items and plain items in
 * one list are a task list and a bulleted list in the editor), so each list
 * reading back on its own is not enough: the run is read back as a whole.
 * When it reads differently, every list is written with each block on lines
 * of its own; when that reads differently too, the last resort of
 * `listChunk` applies to the run: it stays as it was loaded, or, with
 * nothing loaded in its place, its blocks are saved without the lists.
 */
function checkedRun(chunks: readonly Chunk[], from: number, to: number, source: SourceMap, tools: ListTools): Chunk[] {
  const run = chunks.slice(from, to);
  const lists = run.flatMap((chunk) => chunk.nodes ?? []);
  if (runReadsBack(joinedChunks(run, source), lists, tools)) return run;
  const wide = lists.map((list) => wideList(list, freshHelpers(tools))).join("\n\n");
  if (runReadsBack(wide, lists, tools)) return [{ text: wide, block: -1, nodes: lists }];
  const loaded = asLoaded(chunks, from, to, source);
  if (loaded) return loaded;
  const plain = lists.map((list) => withoutTheList(list, tools)).filter((text) => text !== "").join("\n\n");
  return plain ? [{ text: plain, block: -1 }] : [];
}

/** True for a chunk that is a loaded block, as loaded. */
function asItWas(chunk: Chunk): boolean {
  return chunk.block >= 0 && chunk.edited !== true;
}

/**
 * The document's chunks with every run of lists that holds an edit read
 * back as a whole (`checkedRun`). A list on its own was checked when it was
 * written (`listChunk`), and loaded blocks nobody touched need no check.
 */
export function checkedListRuns(chunks: Chunk[], source: SourceMap, tools: ListTools): Chunk[] {
  const checked: Chunk[] = [];
  let from = 0;
  while (from < chunks.length) {
    let to = from;
    while (writesLists(chunks[to])) to += 1;
    const run = chunks.slice(from, to);
    if (run.length < 2 || run.every(asItWas)) {
      checked.push(...chunks.slice(from, Math.max(to, from + 1)));
    } else {
      checked.push(...checkedRun(chunks, from, to, source, tools));
    }
    from = Math.max(to, from + 1);
  }
  return checked;
}

/** Marks a loaded block as written and returns it as the new previous block; a chunk with no loaded block (-1) changes nothing. */
export function claimed(block: number, used: Set<number>, previous: number): number {
  if (block < 0) return previous;
  used.add(block);
  return block;
}

/** The map of a list item's content, when that Markdown loads as exactly the item's content. */
export function itemContentMap(markdown: string, item: JSONContent, tools: ListTools): SourceMap | null {
  const loaded = tools.load(markdown);
  if (loaded.rawBlocks > 0) return null;
  return tools.key({ content: loaded.doc.content ?? [] }) === tools.key({ content: item.content ?? [] }) ? { ...loaded.source, inItem: true } : null;
}
