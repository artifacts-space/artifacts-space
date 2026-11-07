import { describe, expect, it } from "vitest";

import { isCoreLanguage, resolveLanguage } from "./languages";

describe("resolveLanguage", () => {
  it("should map a short alias to its grammar when the label is an alias", () => {
    expect(resolveLanguage("ts")).toBe("typescript");
    expect(resolveLanguage("sh")).toBe("shellscript");
    expect(resolveLanguage("yml")).toBe("yaml");
  });

  it("should ignore case, spaces, and a language- prefix when reading the label", () => {
    expect(resolveLanguage("  TypeScript ")).toBe("typescript");
    expect(resolveLanguage("language-py")).toBe("python");
  });

  it("should return null when the language is unknown or empty", () => {
    expect(resolveLanguage("brainfudge")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage(undefined)).toBeNull();
  });

  it("should mark only the core set as server-highlighted when asked", () => {
    expect(isCoreLanguage("typescript")).toBe(true);
    expect(isCoreLanguage("cpp")).toBe(false);
  });
});
