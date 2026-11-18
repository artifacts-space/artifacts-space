import { describe, expect, it } from "vitest";

import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

function cellContent(markdown: string, row: number, column: number) {
  const [table] = parseMarkdown(markdown).doc.content ?? [];
  return table?.content?.[row]?.content?.[column]?.content?.[0]?.content?.map((child) => child.type);
}

describe("line breaks in table cells in the editor", () => {
  it("should load a br tag in a cell as a line break when the table is loaded", () => {
    const loaded = parseMarkdown("| a |\n| --- |\n| one<br>two |\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(cellContent("| a |\n| --- |\n| one<br>two |\n", 1, 0)).toEqual(["text", "hardBreak", "text"]);
  });

  it("should load a br tag inside bold in a cell as a line break", () => {
    expect(cellContent("| a |\n| --- |\n| **one<br>two** |\n", 1, 0)).toEqual(["text", "hardBreak", "text"]);
  });

  it("should write a line break typed in a cell back as a br tag", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }] }] }] },
        ],
      }],
    };
    const written = serializeMarkdown(doc, { original: "", leading: "", blocks: [], endsWithNewline: true });
    expect(written).toContain("one<br>two");
    expect(parseMarkdown(written).rawBlocks).toBe(0);
  });

  it("should keep other HTML in a cell as written when the table is loaded", () => {
    expect(parseMarkdown("| a |\n| --- |\n| x<b>y</b> |\n").rawBlocks).toBe(1);
  });

  it("should keep a br tag outside a table as written when it is in a paragraph", () => {
    expect(parseMarkdown("one<br>two\n").rawBlocks).toBe(1);
  });
});
