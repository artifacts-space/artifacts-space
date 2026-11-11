import { describe, expect, it } from "vitest";

import { contentForSave, withPlainUiFileRefs, withRelativeFileLinks } from "./content-on-save";
import { fileRefsInContent } from "./refs";

describe("withRelativeFileLinks", () => {
  const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const absolute = { content: `![Shot](https://artifacts.space/api/files/${fileId}#width=50)` };

  it("should save this site's absolute file links in the relative form when an agent re-saves the Markdown version", () => {
    expect(withRelativeFileLinks("markdown", absolute, "https://artifacts.space")).toEqual({ content: `![Shot](/api/files/${fileId}#width=50)` });
  });

  it("should leave other formats, and saves without content, as sent", () => {
    expect(withRelativeFileLinks("text", absolute, "https://artifacts.space")).toBe(absolute);
    const titleOnly: { title: string; content?: string } = { title: "Plan" };
    expect(withRelativeFileLinks("markdown", titleOnly, "https://artifacts.space")).toBe(titleOnly);
  });
});

describe("withPlainUiFileRefs", () => {
  const fileId = "2ad2c0c9-4a51-4f53-9a7e-0f1d1e2c3b4a";
  const spec = (file: string) => `{"root":"i","elements":{"i":{"type":"Image","props":{"file":"${file}"}}}}`;

  it("should write an escaped file id plainly, so the text names the same file the spec does", () => {
    const escaped = spec(`2\\u0061${fileId.slice(2)}`);
    expect(fileRefsInContent("ui", escaped)).toEqual([fileId]);
    expect(escaped.toLowerCase()).not.toContain(fileId);
    const saved = withPlainUiFileRefs(escaped);
    expect(saved).toContain(fileId);
    expect(JSON.parse(saved)).toEqual(JSON.parse(escaped));
  });

  it("should save a spec with plain ids, or with none, exactly as sent", () => {
    const plain = `${spec(fileId.toUpperCase())}\n`;
    expect(withPlainUiFileRefs(plain)).toBe(plain);
    expect(withPlainUiFileRefs("not json")).toBe("not json");
  });

  it("should apply to ui saves through contentForSave", () => {
    expect(contentForSave("ui", { content: spec(`2\\u0061${fileId.slice(2)}`) }, null).content).toContain(fileId);
  });
});
