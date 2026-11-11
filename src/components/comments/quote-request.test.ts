import { describe, expect, it } from "vitest";

import { quotedCommentBody, requestQuotedComment, takeQuotedComment } from "./quote-request";

describe("quotedCommentBody", () => {
  it("should quote the block and link back to it, ready for the comment", () => {
    expect(quotedCommentBody("Ship it\n on Friday", "https://a.test/artifact/x#block=Ship")).toBe("> Ship it on Friday\n>\n> [Go to this block](https://a.test/artifact/x#block=Ship)\n\n");
  });

  it("should keep the link whole when the block's words have parentheses", () => {
    const body = quotedCommentBody("1) First thing", "https://a.test/artifact/x#block=1%29%20First%20thing");
    expect(body).toContain("[Go to this block](https://a.test/artifact/x#block=1%29%20First%20thing)\n");
  });

  it("should cut a long block at 280 characters when quoting", () => {
    const body = quotedCommentBody("word ".repeat(200), "https://a.test/x");
    const quote = body.split("\n")[0] ?? "";
    expect(quote.length).toBeLessThanOrEqual(282);
    expect(quote.endsWith("…")).toBe(true);
  });

  it("should give only the link when the block has no text", () => {
    expect(quotedCommentBody("  ", "https://a.test/x")).toBe("> [Go to this block](https://a.test/x)\n\n");
  });
});

describe("requestQuotedComment and takeQuotedComment", () => {
  it("should hand the quote over once to that artifact's comments", () => {
    requestQuotedComment("abc", "> hi\n\n");
    expect(takeQuotedComment("other")).toBeNull();
    expect(takeQuotedComment("abc")).toBe("> hi\n\n");
    expect(takeQuotedComment("abc")).toBeNull();
  });
});
