import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Schema } from "@tiptap/pm/model";

import { needsRawBlock, splitBlocks, type LooseToken, type SourceBlock, type SplitSource } from "./markdown-blocks";
import { markdownSchemaExtensions } from "./markdown-schema";
import { RAW_MARKDOWN } from "./raw-markdown-node";

interface Engine {
  schema: Schema;
  manager: MarkdownManager;
}

let engine: Engine | null = null;

/**
 * One schema and one Markdown manager per page. The manager registers its
 * tokenizers on marked when it is created, so it must exist only once.
 */
function getEngine(): Engine {
  if (engine) return engine;
  const extensions = markdownSchemaExtensions();
  engine = { schema: getSchema(extensions), manager: new MarkdownManager({ extensions }) };
  return engine;
}

/** A block of the loaded source and the key of the nodes it became. */
interface MappedBlock {
  key: string;
  nodeCount: number;
  text: string;
  after: string;
}

/**
 * What the editor remembers about the Markdown it loaded, so blocks nobody
 * edited are written back exactly as they were.
 */
export interface SourceMap {
  original: string;
  leading: string;
  blocks: MappedBlock[];
  endsWithNewline: boolean;
}

/** A loaded document: the editor's content and the map back to the source. */
export interface LoadedMarkdown {
  doc: JSONContent;
  source: SourceMap;
  /** How many blocks stay as written because the editor cannot show them. */
  rawBlocks: number;
}

/** A node's identity for matching: its canonical JSON. */
export function nodeKey(node: JSONContent): string {
  return JSON.stringify(node);
}

function rawNode(text: string): JSONContent {
  return { type: RAW_MARKDOWN, attrs: { source: text } };
}

/** Schema-checked, canonical JSON for parsed nodes, or null if the schema rejects them. */
function canonicalNodes(nodes: JSONContent[], schema: Schema): JSONContent[] | null {
  try {
    return nodes.map((node) => {
      const checked = schema.nodeFromJSON(node);
      checked.check();
      return checked.toJSON() as JSONContent;
    });
  } catch {
    return null;
  }
}

function parseNodes(text: string, current: Engine): JSONContent[] | null {
  try {
    const parsed = current.manager.parse(text).content ?? [];
    return parsed.length > 0 ? canonicalNodes(parsed, current.schema) : null;
  } catch {
    return null;
  }
}

/** Markdown for nodes, without the blank lines a renderer may add around them. */
function renderNodes(nodes: JSONContent[], current: Engine): string {
  return current.manager.serialize({ type: "doc", content: nodes }).replace(/^\n+|\n+$/g, "");
}

/**
 * The nodes for one block, if the editor can show the block and write it
 * back with the same meaning. Anything else stays a raw block.
 */
function richNodes(block: SourceBlock, definitions: string, current: Engine): JSONContent[] | null {
  if (needsRawBlock(block.token)) return null;
  const nodes = parseNodes(definitions ? `${block.text}\n\n${definitions}` : block.text, current);
  if (!nodes) return null;
  const again = parseNodes(renderNodes(nodes, current), current);
  if (!again || nodeKey({ content: again }) !== nodeKey({ content: nodes })) return null;
  return nodes;
}

function blockNodes(block: SourceBlock, definitions: string, current: Engine): { nodes: JSONContent[]; raw: boolean } {
  const nodes = richNodes(block, definitions, current);
  if (nodes) return { nodes, raw: false };
  const raw = canonicalNodes([rawNode(block.text)], current.schema) ?? [rawNode(block.text)];
  return { nodes: raw, raw: true };
}

function normalizeNewlines(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

/** The whole source as one raw block, for input marked cannot split cleanly. */
function loadAsOneRawBlock(markdown: string): LoadedMarkdown {
  const text = normalizeNewlines(markdown).trim();
  const nodes = text ? [rawNode(text)] : [];
  const blocks = text ? [{ key: nodeKey(rawNode(text)), nodeCount: 1, text, after: "" }] : [];
  return {
    doc: { type: "doc", content: nodes },
    source: { original: markdown, leading: "", blocks, endsWithNewline: markdown.endsWith("\n") },
    rawBlocks: nodes.length,
  };
}

/**
 * Splits the source into blocks. Some tokenizers add a final newline to
 * their `raw`, so the source is lexed with one and it is taken off again.
 */
function lexBlocks(normalized: string, current: Engine): SplitSource | null {
  const added = !normalized.endsWith("\n");
  const lexed = added ? `${normalized}\n` : normalized;
  const tokens = current.manager.instance.lexer(lexed) as unknown as LooseToken[];
  const split = splitBlocks(lexed, tokens);
  if (!split || !added) return split;
  const last = split.blocks.at(-1);
  if (last) last.after = last.after.slice(0, -1);
  else split.leading = split.leading.slice(0, -1);
  return split;
}

/** Link reference definitions, added to each block so reference links resolve. */
function linkDefinitions(blocks: readonly SourceBlock[]): string {
  return blocks
    .filter((block) => isDefinition(block.token))
    .map((block) => block.text)
    .join("\n");
}

function isDefinition(token: unknown): boolean {
  return typeof token === "object" && token !== null && "type" in token && token.type === "def";
}

/**
 * Parses Markdown into editor content, block by block. Blocks the editor
 * cannot represent (raw HTML, images inside text, footnotes, link
 * definitions, and anything that would not survive a round trip) become raw blocks that keep
 * their source exactly. The returned map lets `serializeMarkdown` write
 * untouched blocks back byte for byte.
 */
export function parseMarkdown(markdown: string): LoadedMarkdown {
  const current = getEngine();
  const normalized = normalizeNewlines(markdown);
  const split = lexBlocks(normalized, current);
  if (!split) return loadAsOneRawBlock(markdown);
  const definitions = linkDefinitions(split.blocks);
  const content: JSONContent[] = [];
  const blocks: MappedBlock[] = [];
  let rawBlocks = 0;
  for (const block of split.blocks) {
    const { nodes, raw } = blockNodes(block, definitions, current);
    if (raw) rawBlocks += 1;
    content.push(...nodes);
    blocks.push({ key: nodeKey({ content: nodes }), nodeCount: nodes.length, text: block.text, after: block.after });
  }
  return {
    doc: { type: "doc", content },
    source: { original: markdown, leading: split.leading, blocks, endsWithNewline: normalized.endsWith("\n") },
    rawBlocks,
  };
}

/** A piece of output: source text and the loaded block it came from, if any. */
interface Chunk {
  text: string;
  block: number;
}

function isEmptyParagraph(node: JSONContent): boolean {
  return node.type === "paragraph" && (node.content ?? []).every((child) => child.type === "text" && !child.text?.trim());
}

/** Loaded blocks by key, in source order, so repeated blocks match in turn. */
function indexBlocks(source: SourceMap): Map<string, number[]> {
  const index = new Map<string, number[]>();
  source.blocks.forEach((block, position) => {
    const list = index.get(block.key) ?? [];
    list.push(position);
    index.set(block.key, list);
  });
  return index;
}

/**
 * Finds the unused loaded block that matches the nodes at `start`, trying the
 * block after `previous` first so repeated blocks keep their order.
 */
function matchBlock(nodes: JSONContent[], start: number, source: SourceMap, index: Map<string, number[]>, previous: number, used: Set<number>): number {
  const following = previous + 1;
  const next = source.blocks[following];
  const nextMatches = next !== undefined && !used.has(following) && nodeKey({ content: nodes.slice(start, start + next.nodeCount) }) === next.key;
  if (nextMatches) return following;
  const candidates = index.get(nodeKey({ content: nodes.slice(start, start + 1) })) ?? [];
  return candidates.find((candidate) => !used.has(candidate)) ?? -1;
}

function toChunks(nodes: JSONContent[], source: SourceMap, current: Engine): Chunk[] {
  const index = indexBlocks(source);
  const chunks: Chunk[] = [];
  let position = 0;
  let previous = -1;
  const used = new Set<number>();
  while (position < nodes.length) {
    const node = nodes[position];
    const matched = matchBlock(nodes, position, source, index, previous, used);
    const block = source.blocks[matched];
    if (block) {
      used.add(matched);
      chunks.push({ text: block.text, block: matched });
      position += block.nodeCount;
      previous = matched;
      continue;
    }
    position += 1;
    if (!node || isEmptyParagraph(node)) continue;
    const text = renderNodes([node], current);
    // A block with no Markdown yet (an empty or uploading media block) is left out.
    if (text) chunks.push({ text, block: -1 });
  }
  return chunks;
}

function isUnchanged(chunks: Chunk[], source: SourceMap): boolean {
  return chunks.length === source.blocks.length && chunks.every((chunk, position) => chunk.block === position);
}

function separator(previous: Chunk, next: Chunk, source: SourceMap): string {
  const block = source.blocks[previous.block];
  if (block && next.block === previous.block + 1) return block.after;
  return "\n\n";
}

function ending(last: Chunk, source: SourceMap): string {
  const block = source.blocks[last.block];
  if (block && last.block === source.blocks.length - 1) return block.after;
  return source.endsWithNewline ? "\n" : "";
}

function joinChunks(chunks: Chunk[], source: SourceMap): string {
  const first = chunks[0];
  const last = chunks.at(-1);
  if (!first || !last) return "";
  let output = first.block === 0 ? source.leading : "";
  chunks.forEach((chunk, position) => {
    const before = chunks[position - 1];
    if (before) output += separator(before, chunk, source);
    output += chunk.text;
  });
  return output + ending(last, source);
}

/**
 * Writes editor content back to Markdown. Blocks that match a loaded block
 * keep their original source and spacing; new or edited blocks are rendered
 * fresh. An unedited document returns the loaded string exactly.
 */
export function serializeMarkdown(doc: JSONContent, source: SourceMap): string {
  const chunks = toChunks(doc.content ?? [], source, getEngine());
  if (isUnchanged(chunks, source)) return source.original;
  return joinChunks(chunks, source);
}

/** An empty source map, for content that was never loaded from Markdown. */
export function emptySourceMap(): SourceMap {
  return { original: "", leading: "", blocks: [], endsWithNewline: true };
}

/** Parses pasted Markdown into nodes to insert; raw blocks keep what the editor cannot show. */
export function parseMarkdownFragment(markdown: string): JSONContent[] {
  return parseMarkdown(markdown).doc.content ?? [];
}
