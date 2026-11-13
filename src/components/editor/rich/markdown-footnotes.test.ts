import { describe, expect, it } from "vitest";

import { blockCorpus } from "./block-corpus";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

describe("footnotes", () => {
  it.each([
    "```sh\ngrep '[^#]' file\n```\n",
    "Use `s/[^a-z]//g` here.\n",
    "- [ ] Run:\n\n  ```js\n  const id = path.match(/[^/]+$/);\n  ```\n\n  Expect: ok.\n",
    "1. Match:\n\n   ```\n   [^a-z]+\n   ```\n\n2. Done.\n",
    "Read [the docs](https://example.com/a[^b]).\n",
  ])("should format the part when %j has footnote-like text only in code or a link", (markdown) => {
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(0);
    expect(loaded.rawKinds).toEqual([]);
  });

  it("should format text that looks like a footnote reference when the document defines no such footnote", () => {
    expect(parseMarkdown("Match [^a-z] in this text.\n").rawBlocks).toBe(0);
  });

  it("should keep footnotes as written and say so when the document defines them", () => {
    const loaded = parseMarkdown(blockCorpus.rawMarkdown?.samples.footnotes ?? "");
    expect(loaded.rawBlocks).toBe(2);
    expect(loaded.rawKinds).toEqual(["footnote"]);
  });

  it("should keep a paragraph as written when its footnote is defined with a link, which reads as a link definition", () => {
    const markdown = "See the study[^src].\n\n[^src]: https://example.com/paper\n";
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(2);
    expect(loaded.rawKinds).toEqual(["footnote"]);
    expect(serializeMarkdown(structuredClone(loaded.doc), loaded.source)).toBe(markdown);
  });

  it("should store the footnote as written when another part of the document is edited", () => {
    const markdown = "See the study[^src].\n\nMore.\n\n[^src]: https://example.com/paper\n";
    const loaded = parseMarkdown(markdown);
    const doc = structuredClone(loaded.doc);
    const more = doc.content?.find((node) => node.type === "paragraph");
    if (more) more.content = [{ type: "text", text: "More words." }];
    expect(serializeMarkdown(doc, loaded.source)).toBe(markdown.replace("More.", "More words."));
  });

  it("should keep a list item as written when it refers to a footnote defined below", () => {
    const loaded = parseMarkdown("- [ ] Check the source.[^Src]\n- [ ] Ship\n\n[^src]: The source.\n");
    expect(loaded.rawBlocks).toBe(2);
    expect(loaded.rawKinds).toEqual(["footnote"]);
  });
});
