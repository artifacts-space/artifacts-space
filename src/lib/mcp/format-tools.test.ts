import { describe, expect, it } from "vitest";

import { earlierFormatNote, formatInfo, newVisualWork } from "@/lib/artifact-formats";
import { artifactKinds } from "@/lib/artifact-types";
import { exampleCanvas } from "@/lib/canvas/fixtures";
import { fileLimits } from "@/lib/files/config";
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
    expect(guide).toContain("```mermaid {view=split caption=\"How a change ships\"}");
    expect(guide).toMatch(/view: .*preview \(the default\).*code shows only the source.*split shows the source and the diagram/u);
    expect(guide).toContain("wrap=true");
    expect(formatGuide()).toContain("A fenced code block with the language `mermaid` draws as a diagram");
  });

  it("should teach br for a line break in a table cell when the kind is markdown", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain("First line<br>second line");
    expect(guide).toContain("\\| for a pipe");
  });

  it("should teach the color comment and every hue when the kind is markdown", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain("Ship it on Friday <!-- color: red -->");
    expect(guide).toContain("gray, brown, orange, yellow, green, blue, purple, pink, red");
  });

  it("should include rules, the generated component list, and the example when the kind is ui", () => {
    const guide = formatGuide("ui");
    expect(guide).toContain("## Rules");
    expect(guide).toContain("- Metric:");
    expect(guide).toContain('"root": "page"');
    expect(guide).not.toContain("JSONL patches");
  });
});

describe("formatGuide on how many files a document shows", () => {
  it("should state both limits from the one constant the server checks", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain(`A document shows at most ${String(fileLimits.maxInlineFilesPerArtifact)} files in its text`);
    expect(guide).toContain(`counted apart, at most ${String(fileLimits.maxFilesPerArtifact)}`);
    expect(fileLimits.maxInlineFilesPerArtifact).toBe(100);
    expect(fileLimits.maxFilesPerArtifact).toBe(20);
  });
});

describe("formatGuide on which files files_replace changes", () => {
  it("should name every way a plain attachment gets onto an artifact, not only a Files artifact's page", () => {
    const guide = formatGuide("markdown");
    expect(guide).toContain("files_replace is for plain attachments: files attached with files_attach, or added by a person on the artifact's page (Attach file, a file dropped on the page, or the Files section");
    expect(guide).not.toContain("added on a Files artifact's page");
  });
});

describe("formatGuide for canvas", () => {
  it("should include the canvas rules and a valid example when the kind is canvas", () => {
    const guide = formatGuide("canvas");
    expect(guide).toContain("# canvas artifacts");
    expect(guide).toContain('"frames": [');
    expect(guide).toContain('artifacts_formats_guide with kind "ui"');
  });

  it("should point agents at the canvas guide from the overview, for a canvas that exists", () => {
    expect(formatGuide()).toContain('to read or change one, call it with kind "ui" or kind "canvas"');
  });
});

describe("where the format guide sends new visual work", () => {
  it("should send it to an HTML page in the overview, before it names the earlier formats", () => {
    const guide = formatGuide();
    const html = guide.indexOf('call artifacts_formats_guide with kind "html"');
    expect(html).toBeGreaterThan(-1);
    expect(guide.indexOf("The ui and canvas formats are earlier formats")).toBeGreaterThan(html);
    expect(guide).not.toContain("For rich pages built from our components");
  });

  it("should say so in the ui and canvas kinds, in one wording", () => {
    for (const kind of ["ui", "canvas"] as const) {
      expect(formatInfo[kind].agent, kind).toContain(newVisualWork);
      expect(formatInfo[kind].agent, kind).toMatch(/^An earlier format, kept for artifacts that already use it/);
      expect(formatInfo[kind].helper, kind).toMatch(/^An earlier format: .*choose HTML\.$/);
    }
    expect(newVisualWork).toContain('prefer kind "html"');
  });

  it("should open the ui and canvas guides with the same note", () => {
    for (const kind of ["ui", "canvas"] as const) {
      const guide = formatGuide(kind);
      expect(guide.indexOf(earlierFormatNote), kind).toBeGreaterThan(-1);
      expect(guide.indexOf(earlierFormatNote), kind).toBeLessThan(guide.indexOf("## Rules"));
    }
  });

  it("should not call html an earlier format", () => {
    expect(formatInfo.html.agent).not.toMatch(/earlier format/);
    expect(formatGuide("html")).not.toContain(earlierFormatNote);
  });
});

describe("validationReport", () => {
  it("should confirm a valid canvas, and name the frame when one is wrong", () => {
    expect(validationReport("canvas", JSON.stringify(exampleCanvas))).toBe("Valid canvas content. It is ready to save.");
    const broken = JSON.stringify({ version: 1, frames: [{ id: "home", name: "Home", width: 20, spec: {} }] });
    const report = validationReport("canvas", broken);
    expect(report).toMatch(/^Invalid canvas content/);
    expect(report).toContain('Frame "home": "width" must be a whole number from 240 to 2560');
  });

  it("should confirm valid content when there are no issues", () => {
    expect(validationReport("ui", JSON.stringify(exampleUiSpec))).toMatch(/^Valid ui content/);
  });

  it("should list the problems when content is invalid", () => {
    expect(validationReport("json", "{")).toMatch(/^Invalid json content/);
  });
});
