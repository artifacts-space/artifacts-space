import { describe, expect, it } from "vitest";

import { isShellLanguage, shellLines, stripShellPrompts } from "./shell";

describe("shellLines", () => {
  it("should drop every color but comments when the lines are shell", () => {
    const lines = shellLines([[
      { text: "npx", kind: "function" },
      { text: " skills add ", kind: "string" },
      { text: "--skill", kind: "number" },
      { text: " # note", kind: "comment" },
    ]]);
    expect(lines).toEqual([[{ text: "npx skills add --skill", kind: null }, { text: " # note", kind: "comment" }]]);
  });

  it("should dim a leading prompt like a comment when a line starts with one", () => {
    expect(shellLines([[{ text: "$", kind: "keyword" }, { text: " npm i", kind: "string" }]])).toEqual([[
      { text: "$ ", kind: "comment" },
      { text: "npm i", kind: null },
    ]]);
    expect(shellLines([[{ text: "> echo", kind: null }]])).toEqual([[{ text: "> ", kind: "comment" }, { text: "echo", kind: null }]]);
  });

  it("should leave a dollar sign alone when it is not a prompt", () => {
    expect(shellLines([[{ text: "echo $HOME", kind: null }]])).toEqual([[{ text: "echo $HOME", kind: null }]]);
  });
});

describe("stripShellPrompts", () => {
  it("should drop the prompt from every line when lines start with one", () => {
    expect(stripShellPrompts("$ pnpm install\n$ pnpm dev\n> more")).toBe("pnpm install\npnpm dev\nmore");
  });

  it("should keep variables and output lines when they are not prompts", () => {
    expect(stripShellPrompts("echo $HOME\nadded 3 packages")).toBe("echo $HOME\nadded 3 packages");
  });
});

describe("isShellLanguage", () => {
  it("should be true only for the shell grammar when asked", () => {
    expect(isShellLanguage("shellscript")).toBe(true);
    expect(isShellLanguage("typescript")).toBe(false);
    expect(isShellLanguage(null)).toBe(false);
  });
});
