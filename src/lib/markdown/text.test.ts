import { describe, expect, it } from "vitest";

import { fenced, indentContinuation, inlineText, link, markdownTable, quoted, tableCell } from "./text";

describe("fenced", () => {
  it("should use three backticks when the code has none", () => {
    expect(fenced("const a = 1;", "ts")).toBe("```ts\nconst a = 1;\n```");
  });

  it("should use a longer fence when the code contains backticks so it cannot close early", () => {
    const code = "Before\n```\n## Not a heading\n```\nAfter";
    const block = fenced(code, "untrusted-comment");
    expect(block.startsWith("````untrusted-comment\n")).toBe(true);
    expect(block.endsWith("\n````")).toBe(true);
  });

  it("should keep the info string on one line when it holds a line break", () => {
    expect(fenced("x", "ts\nevil")).toBe("```ts evil\nx\n```");
  });
});

describe("table helpers", () => {
  it("should escape pipes and fold line breaks when text goes in a table cell", () => {
    expect(tableCell("a | b\nc")).toBe("a \\| b c");
  });

  it("should pad short rows and cut long ones when building a table", () => {
    expect(markdownTable(["A", "B"], [["1"], ["2", "3", "4"]])).toBe("| A | B |\n| --- | --- |\n| 1 |   |\n| 2 | 3 |");
  });

  it("should return nothing when the table has no header", () => {
    expect(markdownTable([], [["1"]])).toBe("");
  });
});

describe("inline helpers", () => {
  it("should collapse whitespace when text must stay on one line", () => {
    expect(inlineText("  a\n\n b\t c ")).toBe("a b c");
  });

  it("should escape brackets and encode parentheses when writing a link", () => {
    expect(link("a [b]", "https://x.test/a (1)")).toBe("[a \\[b\\]](https://x.test/a%20%281%29)");
  });

  it("should indent continuation lines when a value spans lines inside a list item", () => {
    expect(indentContinuation("one\ntwo\n\nthree", 2)).toBe("one\n  two\n\n  three");
  });

  it("should prefix every line when quoting", () => {
    expect(quoted("a\n\nb")).toBe("> a\n>\n> b");
  });
});
