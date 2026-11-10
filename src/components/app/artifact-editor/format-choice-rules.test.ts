import { describe, expect, it } from "vitest";

import { contentForSwitch, formatSwitchProblem } from "./format-choice-rules";

describe("formatSwitchProblem", () => {
  it("should refuse JSON when the content does not parse", () => {
    expect(formatSwitchProblem("json", "name,value\nAda,1")).toMatch(/^This content can’t be JSON yet\. The content is not valid JSON/);
  });

  it("should allow JSON when the content parses", () => {
    expect(formatSwitchProblem("json", '{ "ok": true }')).toBeNull();
  });

  it("should allow any text as Markdown, Text, or Code", () => {
    for (const kind of ["markdown", "text", "code"] as const) expect(formatSwitchProblem(kind, "a,b\n1,2")).toBeNull();
  });

  it("should refuse Markdown when the content is empty", () => {
    expect(formatSwitchProblem("markdown", "")).toMatch(/^This content can’t be Markdown yet/);
  });

  it("should allow Files when the content is empty", () => {
    expect(formatSwitchProblem("file", "")).toBeNull();
  });
});

describe("contentForSwitch", () => {
  it("should give an empty page a valid start when it becomes a format that cannot be empty", () => {
    for (const kind of ["csv", "json", "svg", "mermaid", "ui"] as const) {
      const content = contentForSwitch(kind, "");
      expect(content, kind).not.toBe("");
      expect(formatSwitchProblem(kind, content), kind).toBeNull();
    }
  });

  it("should keep what was written when the page has content", () => {
    expect(contentForSwitch("csv", "a,b\n1,2")).toBe("a,b\n1,2");
  });

  it("should leave an empty page empty when the format can start empty", () => {
    expect(contentForSwitch("text", "")).toBe("");
  });
});
