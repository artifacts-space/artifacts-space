import { describe, expect, it } from "vitest";

import { toolAccess } from "./tool-access";
import { toolRows, toolSummaries } from "./tool-summaries";

describe("toolSummaries", () => {
  it("should summarize exactly the classified tools when a tool is added or removed", () => {
    expect(Object.keys(toolSummaries).sort()).toEqual(Object.keys(toolAccess).sort());
  });

  it("should keep every summary to one short sentence when shown on the Connections page", () => {
    for (const summary of Object.values(toolSummaries)) {
      expect(summary).toMatch(/^[A-Z][^\n]{8,80}\.$/);
    }
  });
});

describe("toolRows", () => {
  it("should list every tool with its access level and summary when building the table", () => {
    const rows = toolRows();
    expect(rows.map((row) => row.name)).toEqual(Object.keys(toolAccess));
    for (const row of rows) {
      expect(row.access).toBe(toolAccess[row.name]);
      expect(row.summary).toBe(toolSummaries[row.name]);
    }
  });
});
