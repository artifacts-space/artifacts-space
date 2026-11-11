import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { blockCorpus } from "./block-corpus";
import { RAW_MARKDOWN } from "./raw-markdown-node";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/** Every sample in the block corpus, by sample name. */
const corpus: Record<string, string> = Object.fromEntries(Object.values(blockCorpus).flatMap((block) => Object.entries(block.samples)));

/** Every sample with the block it belongs to. */
const blockSamples = Object.entries(blockCorpus).flatMap(([block, entry]) => Object.entries(entry.samples).map(([name, markdown]) => ({ block, name, markdown, node: entry.node, rich: entry.rich })));

function nodeTypes(doc: JSONContent): string[] {
  return (doc.content ?? []).flatMap((node) => [node.type ?? "", ...nodeTypes(node)]);
}

function reparse(markdown: string): JSONContent {
  return parseMarkdown(markdown).doc;
}

function rawSources(doc: JSONContent): string[] {
  return (doc.content ?? []).filter((node) => node.type === RAW_MARKDOWN).map((node) => String(node.attrs?.source));
}

describe("parseMarkdown and serializeMarkdown", () => {
  it.each(Object.entries(corpus))("should return the source byte for byte when %s is not edited", (_name, markdown) => {
    const loaded = parseMarkdown(markdown);
    expect(serializeMarkdown(loaded.doc, loaded.source)).toBe(markdown);
  });

  it.each(Object.entries(corpus))("should keep the meaning when %s is rendered fresh", (_name, markdown) => {
    const loaded = parseMarkdown(markdown);
    const fresh = serializeMarkdown(loaded.doc, { ...loaded.source, blocks: [], original: "" });
    expect(reparse(fresh)).toEqual(loaded.doc);
  });

  it.each(blockSamples)("should load $block sample $name as a $node block", ({ markdown, node, rich }) => {
    const loaded = parseMarkdown(markdown);
    expect(nodeTypes(loaded.doc)).toContain(node);
    if (rich) expect(loaded.rawBlocks).toBe(0);
    else expect(loaded.rawBlocks).toBeGreaterThan(0);
  });

  it("should show GFM tables, task lists, code, links, and nested lists as rich blocks when loaded", () => {
    for (const name of ["table", "alignedTable", "taskList", "taskListNoNewline", "quoteWithList", "hardBreak", "fencedCode", "links", "nestedList", "mixedNested", "emphasis"]) {
      expect(parseMarkdown(corpus[name] ?? "").rawBlocks, name).toBe(0);
    }
  });

  it("should resolve reference links when the definition is elsewhere in the document", () => {
    const loaded = parseMarkdown(corpus.referenceLink ?? "");
    const [paragraph] = loaded.doc.content ?? [];
    const link = paragraph?.content?.find((child) => child.marks?.some((mark) => mark.type === "link"));
    expect(link?.text).toBe("docs");
    expect(loaded.rawBlocks).toBe(1);
  });

  it("should keep the code language when a fenced block is loaded", () => {
    const [code] = parseMarkdown(corpus.fencedCode ?? "").doc.content ?? [];
    expect(code?.type).toBe("codeBlock");
    expect(code?.attrs?.language).toBe("ts");
  });

  it("should keep raw HTML, footnotes, and images inside text as raw blocks when the editor cannot show them", () => {
    expect(rawSources(parseMarkdown(corpus.rawHtml ?? "").doc).join("\n")).toContain("<summary>More</summary>");
    expect(rawSources(parseMarkdown(corpus.inlineHtml ?? "").doc)).toEqual(["Press <kbd>Ctrl</kbd> to continue."]);
    expect(rawSources(parseMarkdown(corpus.footnotes ?? "").doc)).toHaveLength(2);
    expect(rawSources(parseMarkdown(corpus.imageInText ?? "").doc)).toEqual([corpus.imageInText?.trimEnd()]);
  });

  it("should keep untouched blocks as written when another block is edited", () => {
    const markdown = "* star item\n* another\n\nEdit __me__ please.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    const loaded = parseMarkdown(markdown);
    const content = [...(loaded.doc.content ?? [])];
    content[1] = { type: "paragraph", content: [{ type: "text", text: "Edited." }] };
    const output = serializeMarkdown({ type: "doc", content }, loaded.source);
    expect(output).toBe("* star item\n* another\n\nEdited.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
  });

  it("should keep raw blocks when a block is added next to them", () => {
    const loaded = parseMarkdown(corpus.rawHtml ?? "");
    const content = [...(loaded.doc.content ?? []), { type: "paragraph", content: [{ type: "text", text: "New" }] }];
    const output = serializeMarkdown({ type: "doc", content }, loaded.source);
    expect(output).toBe(`${(corpus.rawHtml ?? "").trimEnd()}\n\nNew\n`);
  });

  it("should drop empty paragraphs when the document is saved", () => {
    const loaded = parseMarkdown("One\n");
    const content = [...(loaded.doc.content ?? []), { type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "Two" }] }];
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe("One\n\nTwo\n");
  });

  it("should write a longer fence when code contains a fence", () => {
    const loaded = parseMarkdown("Intro\n");
    const code = { type: "codeBlock", attrs: { language: "md" }, content: [{ type: "text", text: "```js\nx\n```" }] };
    const output = serializeMarkdown({ type: "doc", content: [code] }, loaded.source);
    expect(output).toBe("````md\n```js\nx\n```\n````\n");
    expect(reparse(output).content?.[0]?.content?.[0]?.text).toBe("```js\nx\n```");
  });

  it("should write a table inside a quote without empty quoted lines", () => {
    const loaded = parseMarkdown("> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n");
    const fresh = serializeMarkdown(loaded.doc, { ...loaded.source, blocks: [], original: "" });
    expect(fresh).toBe("> | a   | b   |\n> | --- | --- |\n> | 1   | 2   |\n");
  });

  it("should return an empty string when every block is removed", () => {
    const loaded = parseMarkdown("# Gone\n");
    expect(serializeMarkdown({ type: "doc", content: [] }, loaded.source)).toBe("");
  });
});
