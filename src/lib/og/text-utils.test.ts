import { describe, expect, it } from "vitest";

import { plainMarkdown, squash, stripInlineMarkdown, truncate } from "@/lib/og/text-utils";

describe("truncate", () => {
  it("should keep text that fits", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("should cut long text and end it with an ellipsis when it is too long", () => {
    expect(truncate("a very long sentence", 8)).toBe("a very…");
  });
});

describe("squash", () => {
  it("should collapse whitespace and line breaks into single spaces", () => {
    expect(squash("  a\n\n b\t c ")).toBe("a b c");
  });
});

describe("stripInlineMarkdown", () => {
  it("should keep link and image text and drop emphasis and code marks", () => {
    expect(stripInlineMarkdown("Read **the** [guide](https://x.dev), run `pnpm check` ![logo](a.png)")).toBe("Read the guide, run pnpm check logo");
  });

  it("should drop HTML tags", () => {
    expect(stripInlineMarkdown("<b>bold</b> text")).toBe("bold text");
  });
});

describe("plainMarkdown", () => {
  it("should return the first heading and body lines without code blocks when given a document", () => {
    const doc = "Intro line\n# Title *here*\n\n- item one\n```ts\nconst secret = 1;\n```\n## Second\n1. item two\n---\n| a | b |\n|---|---|\n";
    expect(plainMarkdown(doc, 5)).toEqual({ heading: "Title here", lines: ["Intro line", "item one", "item two", "a b"] });
  });

  it("should stop collecting body lines at the limit when the document is long", () => {
    expect(plainMarkdown("a\nb\nc\nd", 2).lines).toEqual(["a", "b"]);
  });

  it("should leave media blocks out of the text when a line is only an image", () => {
    const doc = '# Plan\n\n![Team photo](/api/files/0f8fad5b-d9cb-469f-a165-70867728950e#width=50 "Lisbon")\n\nWe ship Friday.\n\n> ![Quoted](https://example.com/a.png)\n\nSee ![inline](x.png) here.';
    expect(plainMarkdown(doc, 5)).toEqual({ heading: "Plan", lines: ["We ship Friday.", "See inline here."] });
  });

  it("should leave block color comments out of the heading and body when lines are colored", () => {
    const doc = "## Status <!-- background: green -->\n\nShip it <!-- color: red; background: yellow -->\n- [ ] call back <!-- color: blue -->";
    expect(plainMarkdown(doc, 5)).toEqual({ heading: "Status", lines: ["Ship it", "call back"] });
  });

  it("should return no heading when the document has none", () => {
    expect(plainMarkdown("just text", 3)).toEqual({ heading: null, lines: ["just text"] });
  });
});
