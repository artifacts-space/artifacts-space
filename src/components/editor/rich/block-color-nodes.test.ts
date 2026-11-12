import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { liftBlockColors } from "./block-color-nodes";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/** The Markdown the editor writes for `markdown` after an edit: rendered fresh, not kept as written. */
function fresh(markdown: string): string {
  const loaded = parseMarkdown(markdown);
  return serializeMarkdown(loaded.doc, { ...loaded.source, blocks: [], original: "" });
}

/** Every node of `type` in the document, depth first. */
function nodesOf(doc: JSONContent, type: string): JSONContent[] {
  return (doc.content ?? []).flatMap((node) => [...(node.type === type ? [node] : []), ...nodesOf(node, type)]);
}

describe("block colors in Markdown", () => {
  it("should put the colors on the paragraph and keep its text when loading", () => {
    const [paragraph] = nodesOf(parseMarkdown("Read this first <!-- color: red; background: yellow -->\n").doc, "paragraph");
    expect(paragraph?.attrs).toMatchObject({ color: "red", background: "yellow" });
    expect(paragraph?.content).toEqual([{ type: "text", text: "Read this first" }]);
  });

  it("should color headings, list items, and quoted lines when loading", () => {
    const doc = parseMarkdown("## Status <!-- background: green -->\n\n- one <!-- color: blue -->\n- two\n\n> quoted <!-- color: pink -->\n").doc;
    expect(nodesOf(doc, "heading")[0]?.attrs).toMatchObject({ level: 2, background: "green", color: null });
    const [first, second, quoted] = nodesOf(doc, "paragraph");
    expect(first?.attrs).toMatchObject({ color: "blue" });
    expect(second?.attrs).toMatchObject({ color: null, background: null });
    expect(quoted?.attrs).toMatchObject({ color: "pink" });
  });

  it("should write one canonical comment, color first, when rendering fresh", () => {
    expect(fresh("Loose spacing <!--background:blue;color:green-->\n")).toBe("Loose spacing <!-- color: green; background: blue -->\n");
    expect(fresh("- [ ] call back <!-- color: purple -->\n")).toBe("- [ ] call back <!-- color: purple -->\n");
    expect(fresh("Ends in **bold** <!-- color: orange -->\n")).toBe("Ends in **bold** <!-- color: orange -->\n");
  });

  it("should drop a color comment with no hue when rendering fresh", () => {
    const doc = parseMarkdown("Teal is not a hue <!-- color: teal -->\n").doc;
    expect(nodesOf(doc, "paragraph")[0]?.attrs).toMatchObject({ color: null });
    expect(fresh("Teal is not a hue <!-- color: teal -->\n")).toBe("Teal is not a hue\n");
  });

  it("should keep other comments and comments inside text as written", () => {
    expect(parseMarkdown("A note <!-- TODO: check this -->\n").rawBlocks).toBe(1);
    expect(parseMarkdown("Red <!-- color: red --> then more text\n").rawBlocks).toBe(1);
  });

  it("should leave a marker that ends no paragraph or heading for the schema to reject", () => {
    const marker = { type: "blockColorMarker", attrs: { color: "red", background: null } };
    const lifted = liftBlockColors([{ type: "codeBlock", content: [marker] }]);
    expect(lifted[0]?.content).toEqual([marker]);
  });
});
