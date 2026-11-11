import { describe, expect, it } from "vitest";

import { diagramFailureReason, isMermaidLanguage } from "./mermaid-fence";

describe("isMermaidLanguage", () => {
  it("should detect a diagram when the fence language is mermaid", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
  });

  it("should detect a diagram when the language has other casing or words after it", () => {
    expect(isMermaidLanguage("Mermaid")).toBe(true);
    expect(isMermaidLanguage("  mermaid  ")).toBe(true);
    expect(isMermaidLanguage("mermaid title=Flow")).toBe(true);
  });

  it("should keep a code block when the language is another one or missing", () => {
    expect(isMermaidLanguage("ts")).toBe(false);
    expect(isMermaidLanguage("mermaidjs")).toBe(false);
    expect(isMermaidLanguage("not-mermaid")).toBe(false);
    expect(isMermaidLanguage("")).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });
});

describe("diagramFailureReason", () => {
  it("should keep only the first line when Mermaid reports a parse error", () => {
    expect(diagramFailureReason("Parse error on line 2:\nA -- > B\n-----^\nExpecting 'SEMI', got 'MINUS'")).toBe("Parse error on line 2.");
  });

  it("should skip blank lines and cap long reasons when the message is long", () => {
    expect(diagramFailureReason("\n\n  No diagram type detected  \n")).toBe("No diagram type detected.");
    expect(diagramFailureReason("Lexical error.")).toBe("Lexical error.");
    const reason = diagramFailureReason("x".repeat(400));
    expect(reason).toHaveLength(160);
    expect(reason.endsWith("…")).toBe(true);
  });

  it("should return an empty reason when the message is empty", () => {
    expect(diagramFailureReason("")).toBe("");
    expect(diagramFailureReason(" :\n")).toBe("");
  });
});
