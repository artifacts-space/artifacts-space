import { describe, expect, it } from "vitest";

import { artifactDescription, clipAtWord, DESCRIPTION_MAX, type DescriptionInput } from "./description";

function input(overrides: Partial<DescriptionInput>): DescriptionInput {
  return { kind: "markdown", summary: "", content: "", language: "", files: [], ...overrides };
}

describe("clipAtWord", () => {
  it("should keep text that fits, on one line", () => {
    expect(clipAtWord("  A short\n\nline.  ")).toBe("A short line.");
  });

  it("should cut at a word boundary and add an ellipsis when the text is too long", () => {
    const clipped = clipAtWord("alpha beta gamma delta epsilon", 20);
    expect(clipped).toBe("alpha beta gamma…");
    expect(Array.from(clipped).length).toBeLessThanOrEqual(20);
  });

  it("should drop trailing punctuation before the ellipsis when the cut lands after it", () => {
    expect(clipAtWord("First part, second part goes on", 14)).toBe("First part…");
  });

  it("should cut mid-word when the only space is too early", () => {
    expect(clipAtWord("a supercalifragilisticexpialidocious", 12)).toBe("a supercali…");
  });

  it("should never exceed the maximum when the text is long", () => {
    const long = "word ".repeat(100);
    expect(Array.from(clipAtWord(long)).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe("artifactDescription", () => {
  it("should use the summary when the version has one", () => {
    expect(artifactDescription(input({ summary: "The launch plan for Q1.", content: "# Ignored\n\nBody." }))).toBe("The launch plan for Q1.");
  });

  it("should truncate a long summary at a word boundary", () => {
    const description = artifactDescription(input({ summary: "Plan ".repeat(60) }));
    expect(description.endsWith("…")).toBe(true);
    expect(Array.from(description).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("should excerpt Markdown body text without syntax or code when there is no summary", () => {
    const content = "# Heading\n\nWe ship **bold** ideas with [links](https://x.test) and `code`.\n\n```ts\nconst secret = 1;\n```\n\n- Next step";
    expect(artifactDescription(input({ content }))).toBe("We ship bold ideas with links and code. Next step");
  });

  it("should fall back to the heading when Markdown has no body text", () => {
    expect(artifactDescription(input({ content: "# Only a heading" }))).toBe("Only a heading");
  });

  it("should collapse whitespace in plain text", () => {
    expect(artifactDescription(input({ kind: "text", content: "Line one\n\n  line   two" }))).toBe("Line one line two");
  });

  it("should name the language and the first meaningful line for code", () => {
    const content = "#!/usr/bin/env node\n\n}\nexport function retry() {\n  return 1;\n}";
    expect(artifactDescription(input({ kind: "code", language: "typescript", content }))).toBe("typescript code · export function retry() {");
  });

  it("should say Code when the language is unknown", () => {
    expect(artifactDescription(input({ kind: "code", content: "print('hi')" }))).toBe("Code · print('hi')");
  });

  it("should list a table's row count and columns for CSV", () => {
    const content = "name,team,score\nAda,core,9\nLin,web,7\n";
    expect(artifactDescription(input({ kind: "csv", content }))).toBe("Table · 2 rows · columns name, team, score");
  });

  it("should list top-level keys for a JSON object and the size of a JSON list", () => {
    expect(artifactDescription(input({ kind: "json", content: '{"name":"x","version":2}' }))).toBe("JSON · keys name, version");
    expect(artifactDescription(input({ kind: "json", content: "[1,2,3]" }))).toBe("JSON list · 3 items");
  });

  it("should name the diagram type for Mermaid", () => {
    expect(artifactDescription(input({ kind: "mermaid", content: "sequenceDiagram\n  A->>B: hi" }))).toBe("Diagram · Sequence diagram");
  });

  it("should excerpt a ui spec's readable text", () => {
    const content = JSON.stringify({
      version: 1,
      root: "page",
      elements: {
        page: { type: "Stack", children: ["text"] },
        text: { type: "Text", props: { text: "Weekly revenue is up." } },
      },
    });
    expect(artifactDescription(input({ kind: "ui", content }))).toBe("Weekly revenue is up.");
  });

  it("should use a file artifact's notes, else list its files", () => {
    expect(artifactDescription(input({ kind: "file", content: "Signed **contract** copies." }))).toBe("Signed contract copies.");
    const files = [{ filename: "a.pdf" }, { filename: "b.png" }];
    expect(artifactDescription(input({ kind: "file", files }))).toBe("2 files: a.pdf, b.png");
    expect(artifactDescription(input({ kind: "file", files: [{ filename: "a.pdf" }] }))).toBe("1 file: a.pdf");
  });

  it("should fall back to the kind when nothing usable is left", () => {
    expect(artifactDescription(input({ kind: "svg", content: "<svg><title>x</title></svg>" }))).toBe("SVG image on artifacts.space");
    expect(artifactDescription(input({ kind: "json", content: "not json" }))).toBe("JSON on artifacts.space");
    expect(artifactDescription(input({ kind: "ui", content: "{" }))).toBe("Dashboard on artifacts.space");
    expect(artifactDescription(input({ kind: "file" }))).toBe("Files on artifacts.space");
    expect(artifactDescription(input({ kind: "markdown", content: "```\nonly code\n```" }))).toBe("Markdown on artifacts.space");
  });
});
