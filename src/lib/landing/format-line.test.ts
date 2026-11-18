import { describe, expect, it } from "vitest";

import { offeredFormats } from "@/components/app/artifact-editor/format-choice-rules";
import { earlierFormatKinds } from "@/lib/artifact-formats";

import { formatLine, landingFormatKinds } from "./format-line";

describe("landing format line", () => {
  it("should read as two short sentences when the pricing card lists the formats", () => {
    expect(formatLine()).toBe("Save Markdown docs, web pages, code, plain text, JSON, CSV tables, SVG images, and diagrams. Add files to any of them.");
  });

  it("should leave out the earlier formats when it names formats", () => {
    for (const kind of earlierFormatKinds) expect(landingFormatKinds).not.toContain(kind);
    expect(formatLine()).not.toMatch(/interface|canvas/i);
  });

  it("should name only formats a person can pick on the web when the line lists them", () => {
    const offered = new Set(offeredFormats("markdown"));
    for (const kind of landingFormatKinds) expect(offered.has(kind), kind).toBe(true);
    expect(landingFormatKinds).not.toContain("file");
  });

  it("should print no count when the formats are listed", () => {
    expect(formatLine()).not.toMatch(/\d/);
  });
});
