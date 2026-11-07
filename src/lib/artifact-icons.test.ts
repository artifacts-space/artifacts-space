import { describe, expect, it } from "vitest";

import {
  ICON_FIELD_DESCRIPTION,
  artifactIconInputSchema,
  iconFileId,
  iconLabel,
  iconTitlePrefix,
  normalizeEmoji,
  parseArtifactIcon,
  searchTablerIcons,
  tablerIconEntries,
} from "./artifact-icons";

describe("artifactIconInputSchema", () => {
  it.each(["🚀", "🧪", "👍🏽", "👩‍💻", "👨‍👩‍👧‍👦", "🇺🇸", "1️⃣", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "❤️"])("should accept the single emoji %s", (emoji) => {
    expect(artifactIconInputSchema.parse(emoji)).toBe(emoji);
  });

  it("should accept an allowed Tabler id when the name is in the list", () => {
    expect(artifactIconInputSchema.parse("tabler:rocket")).toBe("tabler:rocket");
  });

  it("should accept an uploaded file id in lowercase when it is a uuid", () => {
    expect(artifactIconInputSchema.parse("file:0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe("file:0f8fad5b-d9cb-469f-a165-70867728950e");
  });

  it("should store a bare symbol fully qualified when it lacks the emoji selector", () => {
    expect(artifactIconInputSchema.parse("❤")).toBe("❤️");
  });

  it("should trim surrounding spaces when the icon is otherwise valid", () => {
    expect(artifactIconInputSchema.parse(" 🚀 ")).toBe("🚀");
  });

  it.each([null, "", "   "])("should mean remove when the input is %j", (value) => {
    expect(artifactIconInputSchema.parse(value)).toBeNull();
  });

  it.each([
    ["plain text", "rocket"],
    ["a letter", "a"],
    ["a digit", "1"],
    ["two emoji", "🚀🚀"],
    ["emoji and text", "🚀 launch"],
    ["text then emoji", "x🚀"],
    ["HTML", "<img src=x onerror=alert(1)>"],
    ["a script tag", "<script>"],
    ["a control character", "\u0007"],
    ["a null byte", "\u0000"],
    ["a newline", "🚀\n🚀"],
    ["a right-to-left override", "‮🚀"],
    ["a zero-width joiner alone", "‍"],
    ["a lone selector", "️"],
    ["an unknown Tabler name", "tabler:not-an-icon"],
    ["a Tabler id with markup", "tabler:<b>"],
    ["an empty Tabler name", "tabler:"],
    ["a Tabler id in caps", "TABLER:rocket"],
    ["another prefix", "lucide:rocket"],
    ["a file id that is not a uuid", "file:../../etc/passwd"],
    ["an empty file id", "file:"],
    ["a file id with markup", "file:<img>"],
    ["a URL", "https://example.com/icon.png"],
    ["an over-long string", "🚀".repeat(40)],
  ])("should refuse %s", (_label, value) => {
    expect(artifactIconInputSchema.safeParse(value).success).toBe(false);
  });

  it("should refuse a number when the input is not text", () => {
    expect(artifactIconInputSchema.safeParse(42).success).toBe(false);
  });

  it("should explain the rule when the input is refused", () => {
    const result = artifactIconInputSchema.safeParse("rocket");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/one emoji/);
  });
});

describe("normalizeEmoji", () => {
  it("should return null when the text is a word", () => {
    expect(normalizeEmoji("hello")).toBeNull();
  });
});

describe("parseArtifactIcon", () => {
  it("should parse a stored Tabler id when it is allowed", () => {
    expect(parseArtifactIcon("tabler:bug")).toEqual({ type: "tabler", name: "bug" });
  });

  it("should name the file when the icon is an uploaded image", () => {
    expect(iconFileId("file:0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(iconFileId("🚀")).toBeNull();
    expect(iconTitlePrefix("file:0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("");
  });

  it("should return null when a stored value is no longer allowed", () => {
    expect(parseArtifactIcon("tabler:retired-icon")).toBeNull();
    expect(parseArtifactIcon(null)).toBeNull();
  });
});

describe("tablerIconEntries", () => {
  it("should hold between 60 and 120 unique icons when curated", () => {
    const names = tablerIconEntries.map((item) => item.name);
    expect(names.length).toBeGreaterThanOrEqual(60);
    expect(names.length).toBeLessThanOrEqual(120);
    expect(new Set(names).size).toBe(names.length);
  });

  it("should use kebab-case names when listed", () => {
    for (const item of tablerIconEntries) expect(item.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("searchTablerIcons", () => {
  it("should find icons by keyword when the label differs", () => {
    expect(searchTablerIcons("adr").map((item) => item.name)).toContain("gavel");
  });

  it("should return every icon when the search is empty", () => {
    expect(searchTablerIcons("  ")).toHaveLength(tablerIconEntries.length);
  });
});

describe("iconTitlePrefix", () => {
  it("should prefix the emoji when the icon is an emoji", () => {
    expect(iconTitlePrefix("🚀")).toBe("🚀 ");
  });

  it("should add nothing when the icon is a Tabler id or missing", () => {
    expect(iconTitlePrefix("tabler:rocket")).toBe("");
    expect(iconTitlePrefix(null)).toBe("");
  });
});

describe("iconLabel", () => {
  it("should name a Tabler icon by its label when it is set", () => {
    expect(iconLabel("tabler:gavel")).toBe("Decision");
    expect(iconLabel(null)).toBe("No icon");
  });
});

describe("ICON_FIELD_DESCRIPTION", () => {
  it("should list every allowed Tabler name when agents read it", () => {
    for (const item of tablerIconEntries) expect(ICON_FIELD_DESCRIPTION).toContain(item.name);
    expect(ICON_FIELD_DESCRIPTION).toMatch(/null or "" removes/);
  });
});
