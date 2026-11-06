import { describe, expect, it } from "vitest";

import { highlightDraft, type HighlightStyle, type HighlightToken } from "./composer-highlight";
import type { MentionKind } from "./mentions";

const resolved: ReadonlyMap<string, MentionKind> = new Map([
  ["dev", "person"],
  ["claude-code", "agent"],
]);

/** The tokens that carry `style`, as their text. */
function styled(tokens: HighlightToken[], style: HighlightStyle) {
  return tokens.filter((token) => token.styles.includes(style)).map((token) => token.text);
}

function joined(tokens: HighlightToken[]) {
  return tokens.map((token) => token.text).join("");
}

const ownerComment =
  "@dev looks good. I noticed one thing, Your @handle didn't change state when I typed it. AND I cannot use `md` formatting in the comments. the `for code looks very odd. *we should fix these nits* and also make sure font size min applied to artifacts.";

describe("highlightDraft", () => {
  it("should give back the exact text when tokens are joined", () => {
    const samples = [
      ownerComment,
      "",
      "trailing newline\n",
      "emoji 👩‍💻 `code 🎉` **bold 😀**\n\n```ts\nconst a = 1;\n```\n",
      "unclosed ```\nfence",
      "\\*not italic\\* and \\`not code\\`",
    ];
    for (const sample of samples) expect(joined(highlightDraft(sample, resolved))).toBe(sample);
  });

  it("should mark a code span and its backticks when the span is closed", () => {
    const tokens = highlightDraft("use `md` here", resolved);
    expect(styled(tokens, "code")).toEqual(["md"]);
    expect(styled(tokens, "codeMark")).toEqual(["`", "`"]);
  });

  it("should leave an unmatched backtick as plain text when no closing run exists", () => {
    const tokens = highlightDraft("the `for code looks odd", resolved);
    expect(styled(tokens, "code")).toEqual([]);
    expect(styled(tokens, "codeMark")).toEqual([]);
  });

  it("should close a double-backtick span only on a run of the same length", () => {
    const tokens = highlightDraft("``a ` b`` and `c`", resolved);
    expect(styled(tokens, "code")).toEqual(["a ` b", "c"]);
  });

  it("should not let a code span cross a blank line when the paragraph ends", () => {
    expect(styled(highlightDraft("`open\n\nclose`", resolved), "code")).toEqual([]);
  });

  it("should mark fenced blocks and ignore markup and mentions inside them", () => {
    const tokens = highlightDraft("```ts\n**no** @dev\n```\nafter **yes**", resolved);
    expect(styled(tokens, "code")).toEqual(["**no** @dev\n"]);
    expect(styled(tokens, "codeMark")).toEqual(["```ts\n", "```"]);
    expect(styled(tokens, "strong")).toEqual(["yes"]);
    expect(styled(tokens, "mention")).toEqual([]);
  });

  it("should run an unclosed fence to the end of the text", () => {
    expect(styled(highlightDraft("~~~\nstill code\n*x*", resolved), "code")).toEqual(["still code\n*x*"]);
  });

  it("should mark bold, italic, and strikethrough with their delimiters", () => {
    const tokens = highlightDraft("**bold** and *it* and _also_ and ~~gone~~", resolved);
    expect(styled(tokens, "strong")).toEqual(["bold"]);
    expect(styled(tokens, "em")).toEqual(["it", "also"]);
    expect(styled(tokens, "del")).toEqual(["gone"]);
    expect(styled(tokens, "mark")).toEqual(["**", "**", "*", "*", "_", "_", "~~", "~~"]);
  });

  it("should not treat snake_case or a spaced asterisk as italic", () => {
    const tokens = highlightDraft("snake_case_name and 2 * 3 * 4\n* list item", resolved);
    expect(styled(tokens, "em")).toEqual([]);
  });

  it("should not style escaped delimiters", () => {
    const tokens = highlightDraft("\\*plain\\* and \\`tick\\`", resolved);
    expect(styled(tokens, "em")).toEqual([]);
    expect(styled(tokens, "code")).toEqual([]);
    expect(styled(tokens, "mark")).toEqual(["\\", "\\", "\\", "\\"]);
  });

  it("should mark a link label and dim its brackets and URL", () => {
    const tokens = highlightDraft("see [the docs](https://example.com/a_b_c) now", resolved);
    expect(styled(tokens, "link")).toEqual(["the docs"]);
    expect(styled(tokens, "mark")).toEqual(["[", "](https://example.com/a_b_c)"]);
    expect(styled(tokens, "em")).toEqual([]);
  });

  it("should mark a bare URL without reading its underscores as italic", () => {
    const tokens = highlightDraft("go to https://example.com/_x_/y.", resolved);
    expect(styled(tokens, "link")).toEqual(["https://example.com/_x_/y"]);
    expect(styled(tokens, "em")).toEqual([]);
  });

  it("should mark a heading line", () => {
    const tokens = highlightDraft("## Plan\nbody", resolved);
    expect(styled(tokens, "heading")).toEqual([" Plan"]);
    expect(styled(tokens, "mark")).toEqual(["##"]);
  });

  it("should mark resolved mentions next to punctuation with their kind", () => {
    const tokens = highlightDraft("(@dev), @claude-code. and @dev!", resolved);
    expect(tokens.filter((token) => token.mention).map((token) => [token.text, token.mention])).toEqual([
      ["@dev", "person"],
      ["@claude-code", "agent"],
      ["@dev", "person"],
    ]);
  });

  it("should leave unknown handles and email addresses plain", () => {
    const tokens = highlightDraft("ask @handle or mail a@b.com and dev@dev.com", resolved);
    expect(styled(tokens, "mention")).toEqual([]);
  });

  it("should skip mentions inside code and links but keep them inside bold", () => {
    const tokens = highlightDraft("`@dev` [@dev](https://example.com) **@dev**", resolved);
    expect(styled(tokens, "mention")).toEqual(["@dev"]);
    expect(tokens.find((token) => token.mention)?.styles).toEqual(["strong", "mention"]);
  });

  it("should highlight the owner's comment: one mention, one code span, one italic run", () => {
    const tokens = highlightDraft(ownerComment, resolved);
    expect(styled(tokens, "mention")).toEqual(["@dev"]);
    expect(styled(tokens, "code")).toEqual(["md"]);
    expect(styled(tokens, "em")).toEqual(["we should fix these nits"]);
  });
});
