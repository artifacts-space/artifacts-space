import { describe, expect, it } from "vitest";

import { highlightCode } from "./highlight-server";

function kindsOf(lines: ReturnType<typeof highlightCode>) {
  return new Set(lines?.flat().map((token) => token.kind));
}

function textOf(lines: ReturnType<typeof highlightCode>) {
  return lines?.map((line) => line.map((token) => token.text).join("")).join("\n");
}

describe("highlightCode on the server", () => {
  it("should color keywords, functions, and strings when the language is TypeScript", () => {
    const code = "export function retryAfter(seconds: number): string {\n  return `Try again in ${seconds} s.`;\n}";
    const lines = highlightCode(code, "ts");
    expect(textOf(lines)).toBe(code);
    const kinds = kindsOf(lines);
    expect(kinds.has("keyword")).toBe(true);
    expect(kinds.has("function")).toBe(true);
    expect(kinds.has("string")).toBe(true);
  });

  it("should color keys apart from string values when the language is JSON", () => {
    const lines = highlightCode('{\n  "service": "billing",\n  "p95Ms": 182\n}', "json");
    const tokens = lines?.flat() ?? [];
    expect(tokens.find((token) => token.text.includes("service"))?.kind).toBe("property");
    expect(tokens.find((token) => token.text.includes("billing"))?.kind).toBe("string");
    expect(tokens.find((token) => token.text === "182")?.kind).toBe("number");
  });

  it("should fall back to plain text when the language is unknown or missing", () => {
    expect(highlightCode("plain words", "klingon")).toBeNull();
    expect(highlightCode("plain words", undefined)).toBeNull();
  });

  it("should highlight TOML config and shell commands when the docs show them", () => {
    const toml = '[mcp_servers.artifacts]\nurl = "https://artifacts.space/api/mcp"';
    const tomlLines = highlightCode(toml, "toml");
    expect(textOf(tomlLines)).toBe(toml);
    expect(kindsOf(tomlLines).has("string")).toBe(true);
    const command = "claude mcp add --transport http artifacts https://artifacts.space/api/mcp";
    const commandLines = highlightCode(command, "bash");
    expect(textOf(commandLines)).toBe(command);
    expect(kindsOf(commandLines).size).toBeGreaterThan(1);
  });

  it("should leave extra languages to the browser when they are outside the core set", () => {
    expect(highlightCode("int main() { return 0; }", "cpp")).toBeNull();
  });
});
