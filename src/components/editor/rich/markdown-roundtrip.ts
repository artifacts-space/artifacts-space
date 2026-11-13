import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Schema } from "@tiptap/pm/model";

import { liftBlockColors } from "./block-color-nodes";
import { boundedMemo, type BoundedMemo } from "./bounded-memo";
import { commentKeepsAsWritten, commentLiteralMarkdown, commentTextMarkdown } from "./comment-text-markdown";
import { needsRawBlock, splitBlocks, type LooseToken, type SourceBlock, type SplitSource } from "./markdown-blocks";
import { markdownSchemaExtensions } from "./markdown-schema";
import { RAW_MARKDOWN } from "./raw-markdown-node";
import { reviewBlocks, type RawKind } from "./markdown-block-details";
import type { ListSource } from "./markdown-list-items";
import { checkedListRuns, claimed, itemContentMap, listChunk, ownWriting, writtenNodes, type ListTools } from "./markdown-roundtrip-lists";
import { writtenDocument, type Chunk } from "./markdown-roundtrip-output";

interface Engine {
  schema: Schema;
  manager: MarkdownManager;
}

/**
 * How a comment's Markdown is judged: `shows` says whether the comment
 * thread renders `markdown` as the box shows `nodes` (same blocks, marks,
 * and text). src/components/comments/comment-markdown.ts supplies it.
 */
export interface CommentFlavor {
  shows: (markdown: string, nodes: readonly JSONContent[]) => boolean;
}

/**
 * Whose Markdown it is. A document (an artifact) is written with the editor's
 * full escaping, as it always was. A comment keeps what the person typed
 * (comment-text-markdown.ts), checks every block it writes by how the
 * thread renders it, and keeps blocks the box would show differently from
 * the thread as written.
 */
export type MarkdownFlavor = "document" | CommentFlavor;

type TextEncoder = (text: string, node: JSONContent, parent: JSONContent | undefined) => string;

let engine: Engine | null = null;
/** The text encoder while a comment's block is written; null writes with the manager's own. */
let textEncoder: TextEncoder | null = null;

/**
 * Lets a comment's text be written with its own encoder, on the one shared
 * manager. `encodeTextForMarkdown` is not part of the manager's public API:
 * if an upgrade renames or drops it, comments go back to the manager's full
 * escaping. comment-markdown.test.ts ("the comment text encoder") fails then.
 */
function hookTextEncoder(manager: MarkdownManager) {
  const base: unknown = Reflect.get(manager, "encodeTextForMarkdown");
  if (typeof base !== "function") return;
  const own = (text: string, node: JSONContent, parent: JSONContent | undefined): unknown => Reflect.apply(base, manager, [text, node, parent]);
  Reflect.set(manager, "encodeTextForMarkdown", (text: string, node: JSONContent, parent: JSONContent | undefined) => (textEncoder ? textEncoder(text, node, parent) : own(text, node, parent)));
}

/**
 * One schema and one Markdown manager per page. The manager registers its
 * tokenizers on marked when it is created, so it must exist only once.
 */
function getEngine(): Engine {
  if (engine) return engine;
  const extensions = markdownSchemaExtensions();
  const manager = new MarkdownManager({ extensions });
  hookTextEncoder(manager);
  engine = { schema: getSchema(extensions), manager };
  return engine;
}

const CODE = "code";

/** True when the text sits where Markdown reads characters literally: a code span or a code block. */
function inCode(node: JSONContent, parent: JSONContent | undefined): boolean {
  return parent?.type === "codeBlock" || (node.marks ?? []).some((mark) => mark.type === CODE);
}

/** True when the text starts a line: the start of its block, or right after a line break. */
function startsLine(node: JSONContent, parent: JSONContent | undefined): boolean {
  const siblings = parent?.content ?? [];
  const index = siblings.indexOf(node);
  return index <= 0 || siblings[index - 1]?.type === "hardBreak";
}

/** A comment's text, escaped only where Markdown needs it. */
const commentEncoder: TextEncoder = (text, node, parent) => (inCode(node, parent) ? text : commentTextMarkdown(text, startsLine(node, parent)));

/** A comment's text with every mark escaped, for when the light escaping reads differently. */
const literalEncoder: TextEncoder = (text, node, parent) => (inCode(node, parent) ? text : commentLiteralMarkdown(text, startsLine(node, parent)));

/** Runs `write` with a comment's text encoder in place. */
function asComment<T>(write: () => T, encoder: TextEncoder = commentEncoder): T {
  textEncoder = encoder;
  try {
    return write();
  } finally {
    textEncoder = null;
  }
}

/** A block of the loaded source and the key of the nodes it became. */
interface MappedBlock {
  key: string;
  nodeCount: number;
  text: string;
  after: string;
  /** A list block's items, so an edit to one item leaves the others as written. */
  list?: ListSource<SourceMap>;
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
  /** True for a list item's content: an edited block there keeps the spacing around it, and the list is checked as a whole. */
  inItem?: boolean;
}

/** A loaded document: the editor's content and the map back to the source. */
export interface LoadedMarkdown {
  doc: JSONContent;
  source: SourceMap;
  /** How many blocks stay as written because the editor cannot show them. */
  rawBlocks: number;
  /** Why those blocks stay as written, each reason once. */
  rawKinds: RawKind[];
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

function readNodes(text: string, current: Engine): JSONContent[] | null {
  try {
    const parsed = current.manager.parse(text).content ?? [];
    return parsed.length > 0 ? canonicalNodes(liftBlockColors(parsed), current.schema) : null;
  } catch {
    return null;
  }
}

/** The last text a written list was read back from, with its nodes: the block's own check reads that text again right after. */
let lastRead: { text: string; nodes: JSONContent[] | null } | null = null;

/** The nodes for `text`, to compare only: the same objects are handed out again for the same text. */
function readBack(text: string, current: Engine): JSONContent[] | null {
  if (lastRead?.text !== text) lastRead = { text, nodes: readNodes(text, current) };
  return lastRead.nodes;
}

function parseNodes(text: string, current: Engine): JSONContent[] | null {
  return lastRead?.text === text ? structuredClone(lastRead.nodes) : readNodes(text, current);
}

/** Markdown for nodes; a list on its own is written so that it reads back as the list (markdown-list-fresh.ts). */
function renderNodes(nodes: JSONContent[], current: Engine): string {
  return writtenNodes(nodes, listTools, () => ownWriting(current.manager, nodes));
}

/**
 * The nodes for one block, if the editor can show the block and write it
 * back with the same meaning. Anything else stays a raw block.
 */
/** True when the editor reads `written` back as `nodes`. */
function readsBack(written: string, nodes: JSONContent[], current: Engine): boolean {
  const again = parseNodes(written, current);
  return again !== null && nodeKey({ content: again }) === nodeKey({ content: nodes });
}

function richDocumentNodes(text: string, current: Engine): JSONContent[] | null {
  const nodes = parseNodes(text, current);
  return nodes && readsBack(renderNodes(nodes, current), nodes, current) ? nodes : null;
}

/**
 * A comment's block in the box only when the box shows it as the thread
 * does, and \@handle or an entity the editor cannot read never loads as text.
 */
function richCommentNodes(source: string, text: string, current: Engine, comment: CommentFlavor): JSONContent[] | null {
  if (commentKeepsAsWritten(source)) return null;
  const nodes = parseNodes(text, current);
  if (!nodes || !readsBack(asComment(() => renderNodes(nodes, current)), nodes, current)) return null;
  return comment.shows(text, nodes) ? nodes : null;
}

function richNodes(block: SourceBlock, definitions: string, current: Engine, flavor: MarkdownFlavor): JSONContent[] | null {
  if (needsRawBlock(block.token)) return null;
  const text = definitions ? `${block.text}\n\n${definitions}` : block.text;
  return flavor === "document" ? richDocumentNodes(text, current) : richCommentNodes(block.text, text, current, flavor);
}

function blockNodes(block: SourceBlock, definitions: string, current: Engine, flavor: MarkdownFlavor): { nodes: JSONContent[]; raw: boolean } {
  const nodes = richNodes(block, definitions, current, flavor);
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
    rawKinds: nodes.length > 0 ? ["other"] : [],
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
export function parseMarkdown(markdown: string, flavor: MarkdownFlavor = "document"): LoadedMarkdown {
  const current = getEngine();
  const normalized = normalizeNewlines(markdown);
  const split = lexBlocks(normalized, current);
  if (!split) return loadAsOneRawBlock(markdown);
  const definitions = linkDefinitions(split.blocks);
  const content: JSONContent[] = [];
  const blocks: MappedBlock[] = [];
  let rawBlocks = 0;
  for (const block of split.blocks) {
    const { nodes, raw } = blockNodes(block, definitions, current, flavor);
    if (raw) rawBlocks += 1;
    content.push(...nodes);
    blocks.push({ key: nodeKey({ content: nodes }), nodeCount: nodes.length, text: block.text, after: block.after });
  }
  const keptAsWritten = (text: string) => canonicalNodes([rawNode(text)], current.schema)?.[0] ?? rawNode(text);
  const review = reviewBlocks(split.blocks, blocks, content, { key: nodeKey, rawNode: keptAsWritten, itemContent: (text, item) => itemContentMap(text, item, listTools), definitions });
  return {
    doc: { type: "doc", content },
    source: { original: markdown, leading: split.leading, blocks, endsWithNewline: normalized.endsWith("\n") },
    rawBlocks: rawBlocks + review.addedRaw,
    rawKinds: review.rawKinds,
  };
}

/** Blocks the box keeps as Markdown, which are written as they are, never judged. */
const writtenAsIs: ReadonlySet<string> = new Set([RAW_MARKDOWN, "media"]);

/** A textblock's text as lines (split at line breaks), marks left out. */
function textLines(node: JSONContent): string[] {
  const lines: string[] = [];
  let line = "";
  for (const child of node.content ?? []) {
    if (child.type !== "hardBreak") {
      line += child.text ?? "";
      continue;
    }
    lines.push(line);
    line = "";
  }
  return [...lines, line];
}

function textblocksOf(node: JSONContent): JSONContent[] {
  if ((node.content ?? []).some((child) => child.type === "text" || child.type === "hardBreak")) return [node];
  return (node.content ?? []).flatMap(textblocksOf);
}

/**
 * The last resort: every textblock as a paragraph of literal text (every
 * mark escaped, line breaks kept, an empty line as an escaped space), so the
 * person's words post as words, never as a structure they did not see.
 */
function literalParagraphs(node: JSONContent): string {
  return textblocksOf(node)
    .map((block) => textLines(block).map((line) => commentLiteralMarkdown(line, true) || "&#32;").join("\\\n"))
    .join("\n\n");
}

/**
 * A comment's new or edited block: with only the escapes it needs when the
 * thread shows that as the box does; else with every mark escaped, when
 * that shows the same; else (no generated case in
 * comment-markdown-fuzz.test.tsx gets here) its words as literal
 * paragraphs, which drop marks rather than post a structure nobody saw.
 * Each candidate is judged by the thread's renderer.
 */
function renderCommentNode(node: JSONContent, current: Engine, comment: CommentFlavor): string {
  if (writtenAsIs.has(node.type ?? "")) return renderNodes([node], current);
  for (const encoder of [commentEncoder, literalEncoder]) {
    const written = asComment(() => renderNodes([node], current), encoder);
    if (comment.shows(written, [node])) return written;
  }
  return literalParagraphs(node);
}

/**
 * Characters of written comment blocks kept per flavor: well over the
 * longest comment (COMMENT_MAX_LENGTH) with its blocks' JSON keys.
 */
const COMMENT_WRITES_BUDGET = 500_000;
const commentWrites = new WeakMap<CommentFlavor, BoundedMemo>();

/**
 * `renderCommentNode`, remembered by the node's key. The box writes the
 * whole comment on every keystroke, and a new comment has no loaded blocks
 * to match, so without this every block would be judged by the thread's
 * renderer again each time. A block's Markdown depends only on the block.
 */
function writtenCommentNode(node: JSONContent, current: Engine, comment: CommentFlavor): string {
  const known = commentWrites.get(comment);
  const memo = known ?? boundedMemo(COMMENT_WRITES_BUDGET);
  if (!known) commentWrites.set(comment, memo);
  return memo(nodeKey(node), () => renderCommentNode(node, current, comment));
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

function toChunks(nodes: JSONContent[], source: SourceMap, current: Engine, flavor: MarkdownFlavor): Chunk[] {
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
      chunks.push({ text: block.text, block: matched, nodes: nodes.slice(position, position + block.nodeCount) });
      position += block.nodeCount;
      previous = matched;
      continue;
    }
    // A comment's list is written whole, in the comment's own escaping, and judged by the thread.
    const listed = flavor === "document" ? listChunk(nodes, position, source, previous, used, listTools) : null;
    if (listed) {
      position += 1;
      if (listed.text) chunks.push(listed);
      previous = claimed(listed.block, used, previous);
      continue;
    }
    position += 1;
    if (!node || isEmptyParagraph(node)) continue;
    const text = flavor === "document" ? renderNodes([node], current) : writtenCommentNode(node, current, flavor);
    // A block with no Markdown yet (an empty or uploading media block) is left out.
    if (text) chunks.push({ text, block: -1, nodes: [node] });
  }
  return chunks;
}

/**
 * Writes editor content back to Markdown. Blocks that match a loaded block
 * keep their original source and spacing; new or edited blocks are rendered
 * fresh. An unedited document returns the loaded string exactly.
 */
export function serializeMarkdown(doc: JSONContent, source: SourceMap, flavor: MarkdownFlavor = "document"): string {
  const chunks = toChunks(doc.content ?? [], source, getEngine(), flavor);
  return writtenDocument(flavor === "document" ? checkedListRuns(chunks, source, listTools) : chunks, source);
}

/** An empty source map, for content that was never loaded from Markdown. */
export function emptySourceMap(): SourceMap {
  return { original: "", leading: "", blocks: [], endsWithNewline: true };
}

/** Parses pasted Markdown into nodes to insert; raw blocks keep what the editor cannot show. */
export function parseMarkdownFragment(markdown: string): JSONContent[] {
  return parseMarkdown(markdown).doc.content ?? [];
}

/** This file's own functions, for the list side of the round trip (markdown-roundtrip-lists.ts). */
const listTools: ListTools = {
  key: nodeKey,
  parse: (markdown) => readBack(markdown, getEngine()),
  canonical: (nodes) => canonicalNodes(nodes, getEngine().schema),
  write: (node) => ownWriting(getEngine().manager, [node]),
  load: (markdown) => parseMarkdown(markdown),
  save: (content, map) => serializeMarkdown({ type: "doc", content }, map),
};
