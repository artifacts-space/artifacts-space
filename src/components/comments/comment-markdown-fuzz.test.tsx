import type { JSONContent } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "@/components/artifact-view/markdown-view";

import { serializeMarkdown } from "@/components/editor/rich/markdown-roundtrip";

import { parseCommentMarkdown, serializeCommentMarkdown } from "./comment-markdown";

/*
 * Awkward plain text typed into the comment box must post as that text: the
 * thread (MarkdownView, as comment-item.tsx renders it) shows one paragraph
 * with the same lines, and no list, heading, quote, rule, code, table,
 * emphasis, or tag the person never saw. The oracle is the rendered HTML,
 * not the box's own check (thread-reading.ts), so the two cannot agree by
 * sharing a mistake.
 */

/** Pieces that start Markdown syntax at the start of a line. */
const lineStarts = ["# ", "## ", "###### ", "> ", ">", "- ", "+ ", "* ", "1. ", "1) ", "10. ", "2)", "===", "---", "***", "___", "```", "~~~", "    ", "\t", "| ", "[ ] ", "- [x] ", "<div>", "<!-- ", "[a]: https://x.co"];
/** Pieces that start Markdown syntax anywhere. */
const inlinePieces = [
  "*", "**", "_", "__", "~", "~~", "`", "``", "[", "]", "(", ")", "[x](y)", "[docs]", "![a](b)", "[^1]",
  "https://x.co", "www.x.co", "a@b.co", "<https://x.co>", "&amp;", "&copy;", "&#169;", "&#x41;", "&", "<b>", "</b>", "<", ">",
  "<!-- c -->", "\\", "\\*", "\\@", "!", "#", "|", ":", "=", "-", "+", " ", "  ", "word", "snake_case", "2 * 3", "Q&A", "@dana", "1.", "a|b",
];

/** A small seeded generator (mulberry32), so a failure can be run again. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("empty list");
  return item;
}

/** One line: maybe a line start, then a few pieces, never blank. */
function awkwardLine(random: () => number): string {
  let line = random() < 0.6 ? pick(random, lineStarts) : "";
  const count = 1 + Math.floor(random() * 5);
  for (let index = 0; index < count; index += 1) line += pick(random, inlinePieces);
  return line.trim() ? line : `${line}x`;
}

/** A paragraph holding `lines` as typed: text joined by line breaks (Shift+Enter). */
function typed(lines: readonly string[]): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: lines.flatMap((line, index) => [...(index > 0 ? [{ type: "hardBreak" }] : []), { type: "text", text: line }]) }] };
}

const entities: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };

/**
 * The lines the thread shows for `markdown`, or null when it shows anything
 * but one plain paragraph: links (the thread links bare addresses) count as
 * their words, as does an address the link policy refuses, and any other
 * element fails.
 */
function shownLines(markdown: string): string[] | null {
  const html = renderToStaticMarkup(<MarkdownView content={markdown} className="x" />);
  const match = /^<div class="artifact-prose x"><p>([\s\S]*)<\/p><\/div>$/.exec(html);
  if (!match) return null;
  const inner = (match[1] ?? "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
    .replace(/<\/?a(?: [^>]*)?>/g, "")
    // A link the link policy refuses shows as its words in a bare span (ExternalLink).
    .replace(/<\/?span>/g, "")
    .replace(/<br\/>\n?/g, "\n");
  if (inner.includes("<")) return null;
  return inner.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => entities[entity] ?? entity).split("\n").map((line) => line.trim());
}

/** What the thread shows for typed lines once stored, next to what was typed (each line without its outer spaces). */
function postAndShow(lines: readonly string[]) {
  const stored = serializeCommentMarkdown(typed(lines), parseCommentMarkdown("").source);
  return { stored, shown: shownLines(stored), typed: lines.map((line) => line.trim()) };
}

describe("awkward text typed into the comment box", () => {
  it("should post a numbered-looking line before a bare address as text, not as a list", () => {
    const { stored, shown } = postAndShow(["1) see https://x.co"]);
    expect(shown).toEqual(["1) see https://x.co"]);
    expect(stored).toBe("1\\) see https://x.co");
  });

  it("should post === after a line break as text, not as a heading underline", () => {
    const { stored, shown } = postAndShow(["see https://x.co", "==="]);
    expect(shown).toEqual(["see https://x.co", "==="]);
    expect(stored).toBe("see https://x.co  \n\\===");
  });

  it("should show every generated text as typed when it is posted", () => {
    const failures: { seed: number; lines: string[]; stored: string; shown: string[] | null }[] = [];
    for (let seed = 1; seed <= 3000; seed += 1) {
      const random = generator(seed);
      const lines = Array.from({ length: 1 + Math.floor(random() * 3) }, () => awkwardLine(random));
      const result = postAndShow(lines);
      if (JSON.stringify(result.shown) !== JSON.stringify(result.typed)) failures.push({ seed, lines, stored: result.stored, shown: result.shown });
    }
    expect(failures.slice(0, 5)).toEqual([]);
  }, 60_000);

  it("should post the words as literal text when no written form reads the same", () => {
    const refusesAll = { shows: () => false };
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1) see ", marks: [{ type: "bold" }] }, { type: "text", text: "*this*" }, { type: "hardBreak" }, { type: "text", text: "  ===" }] }] };
    const stored = serializeMarkdown(doc, parseCommentMarkdown("").source, refusesAll);
    expect(shownLines(stored)).toEqual(["1) see *this*", "==="]);
  });
});
