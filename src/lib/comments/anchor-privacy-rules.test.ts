import { describe, expect, it } from "vitest";

import { anchorForServedQuote, anchorGate, readableText, servedAnchorFinder, storedAnchorOf, textChanged } from "./anchor-privacy-rules";

const approvedContent = "# Launch plan\n\nWe ship the **beta** on Monday.\n\n- Tell the team\n";
const latestOnly = { quote: "acquire Northwind", prefix: "Secret: we will ", suffix: " next spring" };

describe("readableText", () => {
  it("should drop block and inline marks when the source is Markdown", () => {
    expect(readableText(approvedContent)).toBe("Launch plan\n\nWe ship the beta on Monday.\n\nTell the team\n");
  });

  it("should drop the marks of a nested list when its lines are indented", () => {
    expect(readableText("- One\n  - Two\n    - Three\n      1. Four")).toBe("One\nTwo\nThree\nFour");
  });

  it("should leave out lines a reader never sees as words when the source has a fence, a table divider, or a rule", () => {
    expect(readableText("```ts\nconst a = 1;\n```\n\n| Day | Plan |\n| --- | :-: |\n\n---\n\nEnd")).toBe("\nconst a = 1;\n\n\nDay Plan\n\n\n\n\nEnd");
  });

  it("should keep link text and drop the address when a line has a link", () => {
    expect(readableText("See [the brief](https://example.com/brief).")).toBe("See the brief.");
  });
});

describe("anchorGate", () => {
  it("should return every anchor as stored when the viewer is served the latest version", () => {
    expect(anchorGate({ source: "latest" })(latestOnly)).toEqual(latestOnly);
  });

  it("should withhold the anchor when the viewer is served an approved version without its words", () => {
    // Fails if a quote from an unapproved edit reaches a reader of the approved version.
    expect(anchorGate({ source: "approved", content: approvedContent })(latestOnly)).toBeNull();
  });

  it("should show the anchor when its words are in the approved version, even across formatting marks", () => {
    const gate = anchorGate({ source: "approved", content: approvedContent });
    expect(gate({ quote: "the beta on", prefix: "We ship ", suffix: " Monday." })).toEqual({ quote: "the beta on", prefix: "Launch plan We ship", suffix: "Monday. Tell the team" });
  });

  it("should take the text around the quote from the approved version when the stored text around it was never approved", () => {
    // Fails if the stored prefix or suffix (unapproved words) reaches a reader of the approved version.
    const shown = anchorGate({ source: "approved", content: approvedContent })({ quote: "Monday", prefix: "Secret: we will acquire Northwind on", suffix: " and fire the board" });
    expect(shown).not.toBeNull();
    expect(JSON.stringify(shown)).not.toMatch(/Northwind|fire the board|Secret/);
    expect(shown?.prefix).toBe("Launch plan We ship the beta on");
  });

  it("should return the quote as the approved version spells it when the stored quote spaces its letters another way", () => {
    // Matching ignores spaces, so the stored spacing could tell of words that were never approved.
    const shown = anchorGate({ source: "approved", content: "We are nowhere near done." })({ quote: "now here", prefix: "We are ", suffix: " near" });
    expect(shown?.quote).toBe("nowhere");
  });

  it("should withhold the anchor when the approved version is empty", () => {
    expect(anchorGate({ source: "approved", content: "" })({ quote: "Monday", prefix: "", suffix: "" })).toBeNull();
  });
});

describe("servedAnchorFinder", () => {
  it("should find words in the source when marks break them up in the readable text", () => {
    const find = servedAnchorFinder("Call `snake_case_name` here.");
    expect(find({ quote: "snake_case_name", prefix: "", suffix: "" })?.quote).toBe("snake_case_name");
  });
});

describe("anchorForServedQuote", () => {
  it("should anchor an agent's quote when the words read the same without Markdown marks", () => {
    expect(anchorForServedQuote(approvedContent, "ship the beta")).toEqual({ quote: "ship the beta", prefix: "Launch plan We", suffix: "on Monday. Tell the team" });
  });

  it("should return null when the words are not in the served content", () => {
    expect(anchorForServedQuote(approvedContent, "acquire Northwind")).toBeNull();
  });
});

describe("storedAnchorOf", () => {
  it("should return null when the comment has no quote", () => {
    expect(storedAnchorOf({ quote: null, quotePrefix: "a", quoteSuffix: "b" })).toBeNull();
  });

  it("should fill missing context with empty text when only the quote is stored", () => {
    expect(storedAnchorOf({ quote: "words", quotePrefix: null, quoteSuffix: null })).toEqual({ quote: "words", prefix: "", suffix: "" });
  });
});

describe("textChanged", () => {
  const anchor = { quote: "Monday", prefix: "", suffix: "" };
  const find = servedAnchorFinder(approvedContent);

  it("should be false when the comment is on the whole artifact", () => {
    expect(textChanged({ anchored: false, anchor: null }, find)).toBe(false);
  });

  it("should be true when the anchor was withheld", () => {
    expect(textChanged({ anchored: true, anchor: null }, null)).toBe(true);
  });

  it("should be true when the words are no longer in the served content", () => {
    expect(textChanged({ anchored: true, anchor: { ...anchor, quote: "Tuesday" } }, find)).toBe(true);
  });

  it("should be false when the words are still there or the content is unknown", () => {
    expect(textChanged({ anchored: true, anchor }, find)).toBe(false);
    expect(textChanged({ anchored: true, anchor: { ...anchor, quote: "Tuesday" } }, null)).toBe(false);
  });
});
