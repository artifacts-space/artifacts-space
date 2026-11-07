import { describe, expect, it } from "vitest";

import { toolAccess } from "@/lib/mcp/tool-access";

import { mcpToolResults } from "./mcp-results";
import { docsMcpTools, mcpToolGroups, toolsInGroup } from "./mcp-tools";

describe("docsMcpTools", () => {
  it("should document every classified tool once when the server registers them", () => {
    const names = docsMcpTools().map((tool) => tool.name);
    expect([...names].sort()).toEqual(Object.keys(toolAccess).sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("should give every tool a title, a description, and a written result when the reference renders", () => {
    for (const tool of docsMcpTools()) {
      expect(tool.title, tool.name).not.toBe("");
      expect(tool.description, tool.name).not.toBe("");
      expect(mcpToolResults[tool.name].summary, tool.name).not.toBe("");
    }
  });

  it("should read arguments from the real schemas when a tool takes input", () => {
    const create = docsMcpTools().find((tool) => tool.name === "artifacts_create");
    const title = create?.args.find((row) => row.name === "title");
    expect(title).toMatchObject({ required: true, type: "string" });
    expect(title?.constraints).toContain("1–160 chars");
  });

  it("should place every tool in a group when grouping the reference", () => {
    expect(mcpToolGroups.flatMap((group) => toolsInGroup(group))).toHaveLength(docsMcpTools().length);
  });
});
