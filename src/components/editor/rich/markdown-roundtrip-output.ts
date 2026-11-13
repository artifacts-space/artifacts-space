import type { JSONContent } from "@tiptap/core";

import type { SourceMap } from "./markdown-roundtrip";

/*
 * The output side of the round trip (markdown-roundtrip.ts): the pieces a
 * document is written in, and how they are joined back into Markdown.
 */

/** A piece of output: its text and the loaded block it came from (-1 when it was written anew). */
export interface Chunk {
  text: string;
  block: number;
  /** True when the chunk is an edited list written over its loaded block. */
  edited?: boolean;
  /** For such a list: its node, and whether its last item changed (markdown-list-check.ts). */
  list?: { node: JSONContent; last: boolean };
}

function isUnchanged(chunks: readonly Chunk[], source: SourceMap): boolean {
  return chunks.length === source.blocks.length && chunks.every((chunk, position) => chunk.block === position && !chunk.edited);
}

/**
 * Inside a list item, an edited block keeps the spacing it had, so a tight
 * item stays tight. Whether the item still reads the same is checked when
 * its list is written (markdown-list-check.ts).
 */
function spacingInItem(previous: Chunk, next: Chunk, source: SourceMap): string {
  const spacings = [source.blocks[previous.block]?.after, source.blocks[next.block - 1]?.after].filter((after) => after !== undefined);
  // With a block removed between two kept ones, the wider spacing keeps them apart.
  return spacings.reduce((wide, after) => (after.split("\n").length > wide.split("\n").length ? after : wide), spacings[0] ?? "\n\n");
}

/** What stands between two chunks that follow each other in the written document. */
export function separator(previous: Chunk, next: Chunk, source: SourceMap): string {
  const block = source.blocks[previous.block];
  if (block && next.block === previous.block + 1) return block.after;
  return source.inItem ? spacingInItem(previous, next, source) : "\n\n";
}

function ending(last: Chunk, source: SourceMap): string {
  const block = source.blocks[last.block];
  if (block && last.block === source.blocks.length - 1) return block.after;
  return source.endsWithNewline ? "\n" : "";
}

/** The chunks' text with the spacing between them, and nothing before or after. */
export function joinedChunks(chunks: readonly Chunk[], source: SourceMap): string {
  return chunks.map((chunk, position) => {
    const before = chunks[position - 1];
    return before ? `${separator(before, chunk, source)}${chunk.text}` : chunk.text;
  }).join("");
}

/** A document loaded with Windows line ends (CRLF) on every line is saved with them; one that mixes line ends is saved with LF, as before. */
function withLineEnds(markdown: string, original: string): string {
  const windows = original.includes("\r\n") && !/(?:^|[^\r])\n/.test(original);
  return windows ? markdown.replace(/\r?\n/g, "\r\n") : markdown;
}

/**
 * The document as Markdown. Chunks that are the loaded blocks, all of them
 * and in order, give back the loaded string exactly.
 */
export function writtenDocument(chunks: readonly Chunk[], source: SourceMap): string {
  const first = chunks[0];
  const last = chunks.at(-1);
  if (isUnchanged(chunks, source)) return source.original;
  if (!first || !last) return "";
  const leading = first.block === 0 ? source.leading : "";
  return withLineEnds(`${leading}${joinedChunks(chunks, source)}${ending(last, source)}`, source.original);
}
