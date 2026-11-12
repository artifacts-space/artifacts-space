import { describe, expect, it } from "vitest";

import { ANCHOR_CONTEXT_LENGTH, QUOTE_MAX_LENGTH, anchorAt, anchorForQuote, locateQuote, quoteLocator, storedAnchor } from "./anchor-rules";

const page = "The Supasync agent is the single writer, so nobody overwrites anybody.\n\nThe Supahost agent sends its text by message.";

/** The text after "single writer" on one line, cut to the context kept. */
const afterWriter = ", so nobody overwrites anybody. The Supahost agent sends its text by message.".slice(0, ANCHOR_CONTEXT_LENGTH);

/** The words a span covers. */
const wordsAt = (text: string, span: { start: number; end: number } | null) => (span ? text.slice(span.start, span.end) : null);

describe("locateQuote", () => {
  it("should find the words when the quote is in the text once", () => {
    expect(wordsAt(page, locateQuote(page, { quote: "single writer" }))).toBe("single writer");
  });

  it("should find the words when the text breaks its lines and spaces differently", () => {
    const rendered = "The Supasync agent is the single\n   writer, so nobody  overwrites anybody.The Supahost agent sends its text by message.";
    expect(wordsAt(rendered, locateQuote(rendered, { quote: "the single writer, so nobody" }))).toBe("the single\n   writer, so nobody");
    expect(wordsAt(rendered, locateQuote(rendered, { quote: "anybody. The Supahost" }))).toBe("anybody.The Supahost");
  });

  it("should pick the place whose surrounding text matches when the words appear more than once", () => {
    const second = locateQuote(page, { quote: "agent", prefix: "The Supahost ", suffix: " sends its" });
    expect(second?.start).toBe(page.lastIndexOf("agent"));
    const first = locateQuote(page, { quote: "agent", prefix: "The Supasync ", suffix: " is the" });
    expect(first?.start).toBe(page.indexOf("agent"));
  });

  it("should pick the first place when the surrounding text tells nothing apart", () => {
    expect(locateQuote(page, { quote: "agent" })?.start).toBe(page.indexOf("agent"));
  });

  it("should still find the words when the text around them was rewritten", () => {
    const edited = "Only one agent, the single writer, edits this page.";
    expect(wordsAt(edited, locateQuote(edited, { quote: "single writer", prefix: "agent is the ", suffix: ", so nobody" }))).toBe("single writer");
  });

  it("should find nothing when the words were changed or deleted", () => {
    expect(locateQuote("The Supasync agent is the only writer.", { quote: "single writer" })).toBeNull();
    expect(locateQuote("", { quote: "single writer" })).toBeNull();
  });

  it("should find nothing when the quote holds no words", () => {
    expect(locateQuote(page, { quote: " \n " })).toBeNull();
  });

  it("should ignore zero-width characters an editor leaves in the text", () => {
    const withMarks = "single​ writer﻿ here";
    expect(wordsAt(withMarks, locateQuote(withMarks, { quote: "single writer" }))).toBe("single​ writer");
  });
});

describe("quoteLocator", () => {
  it("should find several comments' words in one text when reused", () => {
    const locate = quoteLocator(page);
    expect(wordsAt(page, locate({ quote: "single writer" }))).toBe("single writer");
    expect(wordsAt(page, locate({ quote: "by message" }))).toBe("by message");
    expect(locate({ quote: "not here" })).toBeNull();
  });
});

describe("anchorAt", () => {
  it("should keep the words and the text on both sides when given a selection", () => {
    const start = page.indexOf("single writer");
    const anchor = anchorAt(page, { start, end: start + "single writer".length });
    expect(anchor).toEqual({ quote: "single writer", prefix: "The Supasync agent is the", suffix: afterWriter });
    expect(anchor ? wordsAt(page, locateQuote(page, anchor)) : null).toBe("single writer");
  });

  it("should put the words on one line when the selection runs across lines", () => {
    const start = page.indexOf("anybody.");
    const anchor = anchorAt(page, { start, end: page.indexOf(" agent sends") });
    expect(anchor?.quote).toBe("anybody. The Supahost");
  });

  it("should keep only the first part when the selection is longer than a quote may be", () => {
    const long = "word ".repeat(400);
    const anchor = anchorAt(long, { start: 0, end: long.length });
    expect(anchor?.quote.length).toBeLessThanOrEqual(QUOTE_MAX_LENGTH);
    expect(anchor?.quote.startsWith("word word")).toBe(true);
  });

  it("should keep no more context than the limit when the text around is long", () => {
    const long = `${"before ".repeat(40)}the words${" after".repeat(40)}`;
    const start = long.indexOf("the words");
    const anchor = anchorAt(long, { start, end: start + "the words".length });
    expect(anchor?.prefix.length).toBeLessThanOrEqual(ANCHOR_CONTEXT_LENGTH);
    expect(anchor?.suffix.length).toBeLessThanOrEqual(ANCHOR_CONTEXT_LENGTH);
    expect(anchor?.prefix.endsWith("before")).toBe(true);
    expect(anchor?.suffix.startsWith("after")).toBe(true);
  });

  it("should give no anchor when the selection holds only spaces", () => {
    expect(anchorAt("a   b", { start: 1, end: 4 })).toBeNull();
  });

  it("should read the selection the right way round when its ends are swapped", () => {
    const start = page.indexOf("single writer");
    expect(anchorAt(page, { start: start + 13, end: start })?.quote).toBe("single writer");
  });
});

describe("storedAnchor", () => {
  it("should put each part on one line and within its length when a client sends an anchor", () => {
    const anchor = storedAnchor({ quote: "  single\n\nwriter ", prefix: "x".repeat(200), suffix: "y".repeat(200) });
    expect(anchor).toEqual({ quote: "single writer", prefix: "x".repeat(ANCHOR_CONTEXT_LENGTH), suffix: "y".repeat(ANCHOR_CONTEXT_LENGTH) });
  });

  it("should cut a quote that is too long", () => {
    expect(storedAnchor({ quote: "q".repeat(QUOTE_MAX_LENGTH + 50) })?.quote.length).toBe(QUOTE_MAX_LENGTH);
  });

  it("should give no anchor when the quote is empty", () => {
    expect(storedAnchor({ quote: " \n" })).toBeNull();
  });
});

describe("anchorForQuote", () => {
  it("should add the text around the words when an agent names only the words", () => {
    expect(anchorForQuote(page, "single writer")).toEqual({ quote: "single writer", prefix: "The Supasync agent is the", suffix: afterWriter });
  });

  it("should give no anchor when the words are not in the text", () => {
    expect(anchorForQuote(page, "double writer")).toBeNull();
  });
});
