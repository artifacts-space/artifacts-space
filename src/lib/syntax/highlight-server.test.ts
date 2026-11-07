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

  it("should highlight TOML config when the docs show it", () => {
    const toml = '[mcp_servers.artifacts]\nurl = "https://artifacts.space/api/mcp"';
    const tomlLines = highlightCode(toml, "toml");
    expect(textOf(tomlLines)).toBe(toml);
    expect(kindsOf(tomlLines).has("string")).toBe(true);
  });

  it("should render a shell command in a single foreground colour when the language is bash", () => {
    const command = "npx skills add https://github.com/caldoai/skills --skill untangle-codebase";
    const lines = highlightCode(command, "bash");
    expect(lines).toEqual([[{ text: command, kind: null }]]);
  });

  it("should dim a shell comment when the language is bash", () => {
    const lines = highlightCode("# install the skill\nnpx skills add x", "sh");
    expect(lines?.[0]?.every((token) => token.kind === "comment")).toBe(true);
    expect(lines?.[1]).toEqual([{ text: "npx skills add x", kind: null }]);
  });

  it("should dim a leading prompt when a console line starts with one", () => {
    const lines = highlightCode("$ pnpm dev", "console");
    expect(lines).toEqual([[{ text: "$ ", kind: "comment" }, { text: "pnpm dev", kind: null }]]);
  });

  it("should keep full highlighting for typescript when shell is single-colour", () => {
    const kinds = kindsOf(highlightCode("const answer: number = retry(42);", "typescript"));
    expect(kinds.size).toBeGreaterThan(2);
  });

  it("should leave extra languages to the browser when they are outside the core set", () => {
    expect(highlightCode("int main() { return 0; }", "cpp")).toBeNull();
  });
});
