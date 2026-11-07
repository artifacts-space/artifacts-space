import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { RAW_MARKDOWN } from "./raw-markdown-node";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/** Markdown samples agents commonly write. */
const corpus: Record<string, string> = {
  headings: "# Plan\n\nSome intro text.\n\n## Steps\n\n### Detail\n",
  emphasis: "This has **bold**, _italic_, *star italic*, __under bold__, ~~strike~~, and `code`.\n",
  links: "Read [the docs](https://example.com/docs) or mail [us](mailto:team@example.com).\n",
  bulletList: "- one\n- two\n- three\n",
  starList: "* one\n* two\n",
  orderedList: "1. first\n2. second\n3. third\n",
  nestedList: "- parent\n  - child\n    - grandchild\n- sibling\n",
  mixedNested: "1. step\n   - note\n   - other\n2. next\n",
  taskList: "- [ ] todo\n- [x] done\n",
  fencedCode: "```ts\nconst answer: number = 42;\nconsole.log(answer);\n```\n",
  fencedNoLang: "```\nplain block\n```\n",
  quote: "> Quoted text\n> continues here.\n",
  rule: "Above\n\n---\n\nBelow\n",
  table: "| Name | Role |\n| --- | --- |\n| Ada | Lead |\n| Lin | Dev |\n",
  alignedTable: "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n",
  rawHtml: "Intro\n\n<details>\n<summary>More</summary>\n\nHidden\n\n</details>\n\nOutro\n",
  inlineHtml: "Press <kbd>Ctrl</kbd> to continue.\n",
  footnotes: "A claim.[^1]\n\n[^1]: The source.\n",
  image: "![Diagram](https://example.com/d.png)\n",
  referenceLink: "See [docs][ref].\n\n[ref]: https://example.com\n",
  hardBreak: "Line one  \nLine two\n",
  crlf: "# Title\r\n\r\nBody\r\n",
  noTrailingNewline: "Just a line",
  taskListNoNewline: "- [ ] todo\n- [x] done",
  quoteWithList: "> quote\n>\n> - list in quote\n",
  indentedCode: "    indented code\n",
  setextHeading: "Title\n=====\n",
  entities: "Tom &amp; Jerry \\*not em\\* <https://x.com> and https://y.com\n",
  extraBlankLines: "First\n\n\n\nSecond\n",
};

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

  it("should keep raw HTML, footnotes, and images as raw blocks when the editor cannot show them", () => {
    expect(rawSources(parseMarkdown(corpus.rawHtml ?? "").doc).join("\n")).toContain("<summary>More</summary>");
    expect(rawSources(parseMarkdown(corpus.inlineHtml ?? "").doc)).toEqual(["Press <kbd>Ctrl</kbd> to continue."]);
    expect(rawSources(parseMarkdown(corpus.footnotes ?? "").doc)).toHaveLength(2);
    expect(rawSources(parseMarkdown(corpus.image ?? "").doc)).toEqual(["![Diagram](https://example.com/d.png)"]);
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
