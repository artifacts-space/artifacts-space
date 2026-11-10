import { describe, expect, it } from "vitest";

import { formatSwitchProblem } from "./format-choice-rules";

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
