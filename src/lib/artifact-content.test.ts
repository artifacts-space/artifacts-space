import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { ArtifactContentError, assertValidArtifactContent, assertValidArtifactUpdate, updateCheckOptions, validateArtifactContent } from "./artifact-content";
import { exampleUiSpec } from "./ui/fixtures/example";

describe("validateArtifactContent", () => {
  it("should accept any text when the kind is prose or code", () => {
    for (const kind of ["markdown", "text", "code"]) {
      expect(validateArtifactContent(kind, "{ not json <svg").valid).toBe(true);
    }
  });

  it("should reject broken JSON when the kind is json", () => {
    const result = validateArtifactContent("json", "{ a: 1 }");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not valid JSON");
  });

  it("should refuse empty content except for file artifacts", () => {
    expect(validateArtifactContent("markdown", "").valid).toBe(false);
    expect(validateArtifactContent("markdown", "").message).toContain("Only file artifacts");
    expect(validateArtifactContent("file", "").valid).toBe(true);
    expect(validateArtifactContent("file", "Some *notes*").valid).toBe(true);
  });

  it("should allow an empty body only for markdown when the blank page asks for it", () => {
    expect(validateArtifactContent("markdown", "", { emptyMarkdown: true }).valid).toBe(true);
    expect(validateArtifactContent("json", "", { emptyMarkdown: true }).valid).toBe(false);
    expect(validateArtifactContent("text", "", { emptyMarkdown: true }).valid).toBe(false);
    expect(validateArtifactContent("markdown", "", { emptyMarkdown: false }).valid).toBe(false);
  });

  it("should check csv, svg, and mermaid when those kinds are used", () => {
    expect(validateArtifactContent("csv", "a,b\n1,2").valid).toBe(true);
    expect(validateArtifactContent("csv", "").valid).toBe(false);
    expect(validateArtifactContent("csv", 'a\n"open').valid).toBe(false);
    expect(validateArtifactContent("svg", "<svg></svg>").valid).toBe(true);
    expect(validateArtifactContent("svg", "<html></html>").valid).toBe(false);
    expect(validateArtifactContent("mermaid", "flowchart TD\nA-->B").valid).toBe(true);
    expect(validateArtifactContent("mermaid", "A-->B").valid).toBe(false);
  });

  it("should validate ui specs when the kind is ui", () => {
    expect(validateArtifactContent("ui", JSON.stringify(exampleUiSpec)).valid).toBe(true);
    expect(validateArtifactContent("ui", "{}").valid).toBe(false);
  });
});

describe("assertValidArtifactContent", () => {
  it("should throw a ZodError whose message is the full report when content is invalid", () => {
    expect(() => { assertValidArtifactContent("json", "nope"); }).toThrow(ArtifactContentError);
    try {
      assertValidArtifactContent("json", "nope");
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues[0]?.message).toContain("cannot be saved");
      expect((error as Error).message).toContain("not valid JSON");
    }
  });
});

describe("assertValidArtifactUpdate", () => {
  it("should not load the stored artifact when the update has both kind and content", async () => {
    const load = vi.fn(() => Promise.resolve(null));
    await assertValidArtifactUpdate({ kind: "json", content: "[]" }, load);
    expect(load).not.toHaveBeenCalled();
  });

  it("should check new content against the stored kind when only content changes", async () => {
    await expect(assertValidArtifactUpdate({ content: "not json" }, () => Promise.resolve({ kind: "json", content: "[]" }))).rejects.toThrow(ArtifactContentError);
  });

  it("should check stored content against a new kind when only the kind changes", async () => {
    await expect(assertValidArtifactUpdate({ kind: "ui" }, () => Promise.resolve({ kind: "markdown", content: "# Hi" }))).rejects.toThrow(/ui content/);
  });

  it("should do nothing when neither kind nor content changes", async () => {
    const load = vi.fn(() => Promise.resolve(null));
    await assertValidArtifactUpdate({}, load);
    expect(load).not.toHaveBeenCalled();
  });

  it("should let an artifact whose stored body is empty switch back to empty Markdown", async () => {
    const storedEmpty = () => Promise.resolve({ kind: "file", content: "" });
    await expect(assertValidArtifactUpdate({ kind: "markdown", content: "" }, storedEmpty)).resolves.toBeUndefined();
    await expect(assertValidArtifactUpdate({ kind: "markdown" }, storedEmpty)).resolves.toBeUndefined();
  });

  it("should refuse an update that empties a Markdown body that has content", async () => {
    const storedNotes = () => Promise.resolve({ kind: "markdown", content: "# Notes" });
    await expect(assertValidArtifactUpdate({ content: "" }, storedNotes)).rejects.toThrow(ArtifactContentError);
    await expect(assertValidArtifactUpdate({ kind: "markdown", content: "" }, storedNotes)).rejects.toThrow(ArtifactContentError);
  });

  it("should refuse empty Markdown when the stored artifact cannot be found", async () => {
    await expect(assertValidArtifactUpdate({ kind: "markdown", content: "" }, () => Promise.resolve(null))).rejects.toThrow(ArtifactContentError);
  });

  it("should still refuse an empty Text or Code body when the stored body is empty", async () => {
    await expect(assertValidArtifactUpdate({ kind: "text", content: "" }, () => Promise.resolve({ kind: "file", content: "" }))).rejects.toThrow(ArtifactContentError);
  });
});

describe("updateCheckOptions", () => {
  it("should allow empty Markdown only when the stored body is empty", () => {
    expect(updateCheckOptions("")).toEqual({ emptyMarkdown: true });
    expect(updateCheckOptions("Notes")).toEqual({ emptyMarkdown: false });
    expect(updateCheckOptions(" ")).toEqual({ emptyMarkdown: false });
  });
});
