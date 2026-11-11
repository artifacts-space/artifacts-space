import { describe, expect, it } from "vitest";

import { artifactKinds } from "@/lib/artifact-types";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";

import { formatGuide, validationReport } from "./format-tools";

describe("formatGuide", () => {
  it("should list every accepted format when no kind is given", () => {
    const guide = formatGuide();
    for (const kind of artifactKinds) expect(guide).toContain(`- ${kind}:`);
  });

  it("should explain page icons when no kind is given", () => {
    expect(formatGuide()).toContain("tabler:rocket");
  });

  it("should explain how to embed an uploaded file when the kind is markdown", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain("![Alt text](/api/files/<file id>)");
    expect(guide).toContain("#width=60");
    expect(guide).toContain("#video");
    expect(guide).toContain("files_finalize");
  });

  it("should tell agents to keep diagrams in the document as mermaid fences when the kind is markdown", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain("```mermaid\nflowchart TD");
    expect(guide).toContain("do not publish it as a separate mermaid artifact");
    expect(formatGuide()).toContain("A fenced code block with the language `mermaid` draws as a diagram");
  });

  it("should include rules, the generated component list, and the example when the kind is ui", () => {
    const guide = formatGuide("ui");
    expect(guide).toContain("## Rules");
    expect(guide).toContain("- Metric:");
    expect(guide).toContain('"root": "page"');
    expect(guide).not.toContain("JSONL patches");
  });
});

describe("validationReport", () => {
  it("should confirm valid content when there are no issues", () => {
    expect(validationReport("ui", JSON.stringify(exampleUiSpec))).toMatch(/^Valid ui content/);
  });

  it("should list the problems when content is invalid", () => {
    expect(validationReport("json", "{")).toMatch(/^Invalid json content/);
  });
});
