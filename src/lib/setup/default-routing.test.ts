import { describe, expect, it } from "vitest";

import { CLAUDE_CODE_DENY_ARTIFACT_SETTINGS, cursorRuleMdc, DEFAULT_INSTRUCTION_LINE, instructionFiles } from "./default-routing";

describe("DEFAULT_INSTRUCTION_LINE", () => {
  it("should name the server and every kind of work when people paste it into their instructions", () => {
    expect(DEFAULT_INSTRUCTION_LINE).toMatch(/artifacts\.space \(the `artifacts` MCP server\)/);
    for (const word of ["artifact", "doc", "plan", "report", "page"]) expect(DEFAULT_INSTRUCTION_LINE).toContain(word);
  });

  it("should leave the person a way to ask for the built-in tool by name", () => {
    expect(DEFAULT_INSTRUCTION_LINE).toMatch(/unless I name it\.$/);
  });
});

describe("CLAUDE_CODE_DENY_ARTIFACT_SETTINGS", () => {
  it("should deny Claude Code's Artifact tool by its bare name when added to settings.json", () => {
    expect(JSON.parse(CLAUDE_CODE_DENY_ARTIFACT_SETTINGS)).toEqual({ permissions: { deny: ["Artifact"] } });
  });
});

describe("instructionFiles", () => {
  it("should list each harness once, with Claude Code first", () => {
    const names = instructionFiles.map((file) => file.harness);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).toBe("Claude Code");
  });
});

describe("cursorRuleMdc", () => {
  it("should always apply and carry the line when Cursor loads it as a project rule", () => {
    const rule = cursorRuleMdc();
    expect(rule).toMatch(/^---\n[\s\S]*alwaysApply: true\n---\n/);
    expect(rule).toContain(DEFAULT_INSTRUCTION_LINE);
  });
});
