import { describe, expect, it } from "vitest";

import { checkMermaidSource, mermaidDiagramType } from "./mermaid-source";

describe("mermaidDiagramType", () => {
  it("should find the diagram type when comments and front matter come first", () => {
    expect(mermaidDiagramType("---\ntitle: Flow\n---\n%% note\n\nflowchart TD\n  A-->B")).toBe("flowchart");
    expect(mermaidDiagramType("sequenceDiagram\n  A->>B: hi")).toBe("sequenceDiagram");
    expect(mermaidDiagramType("graph LR;A-->B")).toBe("graph");
  });

  it("should return null when the first line is not a diagram type", () => {
    expect(mermaidDiagramType("A-->B")).toBeNull();
    expect(mermaidDiagramType("")).toBeNull();
  });
});

describe("checkMermaidSource", () => {
  it("should accept known diagrams when they are small", () => {
    expect(checkMermaidSource("pie\n  \"a\": 1")).toBeNull();
  });

  it("should reject source when it is too long", () => {
    expect(checkMermaidSource(`flowchart TD\n${"A-->B\n".repeat(10_000)}`)).toMatch(/limit/);
  });

  it("should explain the fix when the diagram type is missing", () => {
    expect(checkMermaidSource("hello")).toMatch(/flowchart/);
  });
});
