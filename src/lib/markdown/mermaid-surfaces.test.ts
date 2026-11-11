import { describe, expect, it } from "vitest";

import { artifactDescription } from "@/lib/og/description";
import { buildSynopsis } from "@/lib/og/synopsis";
import { plainMarkdown } from "@/lib/og/text-utils";

import { contentToMarkdown } from "./artifact-markdown";

/*
 * A fenced mermaid block on the surfaces other than the read view and the
 * editor (markdown-dialect.md, rule 3): the Markdown version keeps the
 * fenced source, and the link preview text and image skip it.
 */

const fence = "```mermaid\nflowchart TD\n  A[Draft] --> B[Ship]\n```";
const document = `# Release plan\n\nWe ship in two steps.\n\n${fence}\n\nThen we watch the numbers.\n`;

describe("Mermaid blocks outside the read view", () => {
  it("should keep the fenced source exactly when the Markdown version is built", () => {
    const markdown = contentToMarkdown({ kind: "markdown", content: document, language: "", rawUrl: "https://artifacts.space/artifact/abc/raw", files: [] });
    expect(markdown).toContain(fence);
  });

  it("should leave the diagram source out of the link preview text when a document has one", () => {
    expect(plainMarkdown(document, 5)).toEqual({ heading: "Release plan", lines: ["We ship in two steps.", "Then we watch the numbers."] });
    const description = artifactDescription({ kind: "markdown", summary: "", content: document, language: "", files: [] });
    expect(description).not.toContain("flowchart");
    expect(description).toContain("We ship in two steps.");
  });

  it("should build the preview image's synopsis without the diagram source when a document has one", () => {
    const synopsis = buildSynopsis({ kind: "markdown", content: document, language: "", files: [] });
    expect(JSON.stringify(synopsis)).not.toContain("flowchart");
  });
});
