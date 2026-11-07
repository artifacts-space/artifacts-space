import { describe, expect, it } from "vitest";

import type { ArtifactKind } from "@/lib/artifact-types";
import { csvRowCap } from "@/lib/csv-limits";

import { artifactToMarkdown, contentToMarkdown, csvToMarkdown, filesToMarkdown, markdownHeader, notFoundMarkdown, type ArtifactMarkdownInput } from "./artifact-markdown";

const base: ArtifactMarkdownInput = {
  title: "Release plan",
  emoji: "🚀",
  summary: "What ships when.",
  kind: "markdown",
  language: "",
  content: "# Plan\n\nShip it.",
  url: "https://artifacts.space/artifact/abc",
  rawUrl: "https://artifacts.space/artifact/abc/raw",
  author: "@claude-code for Charles",
  updatedBy: "@charles",
  updatedAt: new Date("2026-11-07T12:00:00.000Z"),
  version: 4,
  approvedVersion: false,
  files: [],
  comments: null,
};

function content(kind: ArtifactKind, text: string, extra: Partial<ArtifactMarkdownInput> = {}) {
  return contentToMarkdown({ ...base, kind, content: text, ...extra });
}

describe("markdownHeader", () => {
  it("should show the title with its emoji, format, author, editor, update time, version, URL, and the fetched-from note", () => {
    const header = markdownHeader(base);
    expect(header).toContain("# 🚀 Release plan");
    expect(header).toContain("> What ships when.");
    expect(header).toContain("- Format: markdown\n- Author: @claude-code for Charles\n- Last edited by: @charles\n- Last updated: 2026-11-07T12:00:00.000Z\n- Version: 4\n- URL: https://artifacts.space/artifact/abc");
    expect(header).toContain("Fetched from artifacts.space.");
  });

  it("should say it is the last approved version when an outside reader gets the approved version", () => {
    expect(markdownHeader({ ...base, approvedVersion: true })).toContain("- Version: 4 (the last approved version)");
  });

  it("should keep a title on one line and drop the emoji line parts when the title holds line breaks and there is no emoji", () => {
    expect(markdownHeader({ ...base, emoji: null, title: "Line one\n# Injected" })).toMatch(/^# Line one # Injected\n/);
  });

  it("should name the theme only when the artifact has one", () => {
    expect(markdownHeader({ ...base, theme: "Paper" })).toContain("- Format: markdown\n- Theme: Paper\n");
    expect(markdownHeader({ ...base, theme: null })).not.toContain("Theme:");
  });

  it("should name the language when the format is code", () => {
    expect(markdownHeader({ ...base, kind: "code", language: "ts" })).toContain("- Format: code (ts)");
  });
});

describe("contentToMarkdown", () => {
  it("should return Markdown, text, and file notes as they are", () => {
    expect(content("markdown", "# Hi")).toBe("# Hi");
    expect(content("text", "plain\ntext")).toBe("plain\ntext");
    expect(content("file", "Notes")).toBe("Notes");
  });

  it("should fence code with its language", () => {
    expect(content("code", "const a = 1;", { language: "ts" })).toBe("```ts\nconst a = 1;\n```");
  });

  it("should pretty-print JSON in a json fence", () => {
    expect(content("json", '{"a":1}')).toBe('```json\n{\n  "a": 1\n}\n```');
  });

  it("should fence SVG and Mermaid source", () => {
    expect(content("svg", "<svg/>")).toBe("```svg\n<svg/>\n```");
    expect(content("mermaid", "graph TD; A-->B")).toBe("```mermaid\ngraph TD; A-->B\n```");
  });

  it("should render a ui spec as readable Markdown", () => {
    const spec = JSON.stringify({ version: 1, root: "h", elements: { h: { type: "Heading", props: { text: "Dashboard" } } } });
    expect(content("ui", spec)).toBe("## Dashboard");
  });
});

describe("csvToMarkdown", () => {
  it("should render a GitHub table with a link to the raw CSV", () => {
    expect(csvToMarkdown("name,value\na,1\nb|c,2", base.rawUrl)).toBe(
      "| name | value |\n| --- | --- |\n| a | 1 |\n| b\\|c | 2 |\n\nRaw CSV: [download](https://artifacts.space/artifact/abc/raw)",
    );
  });

  it("should note the cut when the CSV has more rows than the viewer shows", () => {
    const rows = Array.from({ length: csvRowCap + 5 }, (_, index) => `r${String(index)},${String(index)}`);
    const markdown = csvToMarkdown(["name,value", ...rows].join("\n"), base.rawUrl);
    expect(markdown).toContain(`Showing the first 1,000 of 1,005 rows`);
    expect(markdown).not.toContain(`| r${String(csvRowCap)} |`);
  });

  it("should note the cut when the CSV has more columns than the viewer shows", () => {
    const header = Array.from({ length: 52 }, (_, index) => `c${String(index)}`).join(",");
    expect(csvToMarkdown(`${header}\n1`, base.rawUrl)).toContain("the first 50 of 52 columns");
  });
});

describe("filesToMarkdown", () => {
  it("should list each file with its link, type, and size", () => {
    const files = [{ id: "f1", filename: "report [final].pdf", contentType: "application/pdf", size: 1_200_000, url: "https://artifacts.space/api/files/f1" }];
    const markdown = filesToMarkdown(files, "Files");
    expect(markdown).toContain("## Files");
    expect(markdown).toContain("- [report \\[final\\].pdf](https://artifacts.space/api/files/f1) (PDF");
    expect(markdown).toContain("1.2 MB)");
  });

  it("should return nothing when there are no files", () => {
    expect(filesToMarkdown([], "Files")).toBe("");
  });
});

describe("artifactToMarkdown", () => {
  it("should put the header, a rule, the content, and the comments in order", () => {
    const markdown = artifactToMarkdown({ ...base, comments: "## Comments\n\n_No comments yet._" });
    const order = ["# 🚀 Release plan", "---", "# Plan", "## Comments"].map((part) => markdown.indexOf(part));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("should list files under Files for a file artifact without notes", () => {
    const markdown = artifactToMarkdown({ ...base, kind: "file", content: "", files: [{ id: "f", filename: "a.png", contentType: "image/png", size: 10, url: "https://x.test/f" }] });
    expect(markdown).toContain("## Files");
    expect(markdown).not.toContain("_No content._");
  });
});

describe("notFoundMarkdown", () => {
  it("should not depend on the artifact, so a private one reads the same as a missing one", () => {
    expect(notFoundMarkdown()).toBe(notFoundMarkdown());
    expect(notFoundMarkdown()).toContain("# Artifact not found");
  });
});
