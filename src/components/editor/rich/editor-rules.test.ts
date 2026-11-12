import { describe, expect, it } from "vitest";

import { languageOptions } from "./code-block-view";
import { placeholderFor, richEditorExtensions } from "./editor-extensions";
import { needsRawBlock, splitBlocks } from "./markdown-blocks";
import { looksLikeMarkdown, shouldPasteAsMarkdown, withoutUnsafeLinks } from "./markdown-paste";
import { parseMarkdownFragment } from "./markdown-roundtrip";
import { codeFence, isAllowedEditorUri } from "./markdown-schema";
import { filterSlashCommands, slashCommandsFor } from "./slash-commands";

describe("filterSlashCommands", () => {
  it("should offer every block when nothing is typed after the slash", () => {
    expect(filterSlashCommands("")).toHaveLength(16);
  });

  it("should offer the media blocks when their names are typed", () => {
    expect(filterSlashCommands("image").map((command) => command.id)).toEqual(["image"]);
    expect(filterSlashCommands("screens").map((command) => command.id)).toEqual(["image"]);
    expect(filterSlashCommands("pdf").map((command) => command.id)).toEqual(["pdf"]);
    expect(filterSlashCommands("mp4").map((command) => command.id)).toEqual(["video"]);
    expect(filterSlashCommands("upload").map((command) => command.id)).toEqual(["file"]);
  });

  it("should match by title, keyword, or Markdown hint when text is typed", () => {
    expect(filterSlashCommands("tab").map((command) => command.id)).toEqual(["table"]);
    expect(filterSlashCommands("todo").map((command) => command.id)).toEqual(["task"]);
    expect(filterSlashCommands("---").map((command) => command.id)).toEqual(["divider"]);
    expect(filterSlashCommands("mermaid").map((command) => command.id)).toEqual(["mermaid"]);
    expect(filterSlashCommands("diagram").map((command) => command.id)).toEqual(["mermaid"]);
    expect(filterSlashCommands("code").map((command) => command.id)).toEqual(["code", "mermaid"]);
  });

  it("should match nothing when no block fits", () => {
    expect(filterSlashCommands("zzz")).toEqual([]);
  });
});

describe("editors without media", () => {
  const onLinkShortcut = () => false;
  const names = (media: boolean) => richEditorExtensions({ onLinkShortcut, media }).map((extension) => extension.name);

  it("should offer text blocks only when media is off", () => {
    const ids = slashCommandsFor(false).map((command) => command.id);
    expect(ids).toEqual(["h1", "h2", "h3", "bullet", "ordered", "task", "quote", "code", "mermaid", "table", "divider"]);
    expect(filterSlashCommands("image", slashCommandsFor(false))).toEqual([]);
    expect(filterSlashCommands("upload", slashCommandsFor(false))).toEqual([]);
  });

  it("should refuse file paste and drop instead of uploading when media is off", () => {
    expect(names(false)).toContain("mediaRefusal");
    expect(names(false)).not.toContain("mediaInput");
    expect(names(true)).toContain("mediaInput");
    expect(names(true)).not.toContain("mediaRefusal");
  });

  it("should keep the media node when media is off, so media already in the Markdown saves as written", () => {
    expect(names(false)).toContain("media");
  });
});

describe("shouldPasteAsMarkdown", () => {
  it("should read plain text as Markdown when it has Markdown syntax", () => {
    expect(shouldPasteAsMarkdown("## Heading\n\n- item", "")).toBe(true);
    expect(shouldPasteAsMarkdown("| a | b |\n| - | - |", "")).toBe(true);
  });

  it("should leave plain prose alone when it has no Markdown syntax", () => {
    expect(looksLikeMarkdown("Just a sentence, nothing more.")).toBe(false);
  });

  it("should leave the editor's own copies alone when the HTML carries a ProseMirror slice", () => {
    expect(shouldPasteAsMarkdown("# Heading", '<h1 data-pm-slice="1 1 []">Heading</h1>')).toBe(false);
  });
});

describe("codeFence", () => {
  it("should use three backticks when the code has no fence", () => {
    expect(codeFence("const a = 1;")).toBe("```");
  });

  it("should use a longer fence when the code holds a fence", () => {
    expect(codeFence("````md\nx\n````")).toBe("`````");
  });
});

describe("isAllowedEditorUri", () => {
  it("should refuse javascript links when they are typed or pasted", () => {
    expect(isAllowedEditorUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedEditorUri("https://example.com")).toBe(true);
  });
});

describe("languageOptions", () => {
  it("should keep an unlisted language when an agent wrote one", () => {
    expect(languageOptions("elixir").at(-1)).toEqual({ value: "elixir", label: "elixir" });
  });

  it("should offer the standard list when the language is listed", () => {
    expect(languageOptions("ts").some((option) => option.value === "elixir")).toBe(false);
  });
});

describe("placeholderFor", () => {
  const node = (name: string) => ({ type: { name }, attrs: {} });

  it("should invite writing when the document is empty", () => {
    expect(placeholderFor({ editor: { isEmpty: true }, node: node("paragraph") })).toContain("type /");
  });

  it("should hint at the slash menu when a line is empty", () => {
    expect(placeholderFor({ editor: { isEmpty: false }, node: node("paragraph") })).toBe("Type / for blocks");
    expect(placeholderFor({ editor: { isEmpty: false }, node: node("heading") })).toBe("Heading");
  });
});

describe("needsRawBlock", () => {
  it("should keep a block as written when it holds inline HTML", () => {
    expect(needsRawBlock({ type: "paragraph", raw: "a <b>x</b>", tokens: [{ type: "html", raw: "<b>" }] })).toBe(true);
  });

  it("should keep a block as written when it holds a footnote", () => {
    expect(needsRawBlock({ type: "paragraph", raw: "Claim.[^1]", tokens: [] })).toBe(true);
  });

  it("should format a block when it is plain Markdown", () => {
    expect(needsRawBlock({ type: "paragraph", raw: "Plain **text**", tokens: [{ type: "strong", raw: "**text**" }] })).toBe(false);
  });
});

describe("splitBlocks", () => {
  it("should give up when the tokens do not add up to the source", () => {
    expect(splitBlocks("abc", [{ type: "paragraph", raw: "xyz" }])).toBeNull();
  });

  it("should keep the whitespace between blocks when it splits them", () => {
    const split = splitBlocks("\nA\n\n\nB\n", [{ type: "space", raw: "\n" }, { type: "paragraph", raw: "A\n" }, { type: "space", raw: "\n\n" }, { type: "paragraph", raw: "B\n" }]);
    expect(split).toEqual({ leading: "\n", blocks: [{ text: "A", after: "\n\n\n", token: expect.anything() as unknown }, { text: "B", after: "\n", token: expect.anything() as unknown }] });
  });
});

describe("withoutUnsafeLinks", () => {
  const links = (markdown: string) => JSON.stringify(withoutUnsafeLinks(parseMarkdownFragment(markdown))).match(/"href":"[^"]*"/g) ?? [];

  it("should keep a safe link when Markdown is pasted", () => {
    expect(links("Read [the notes](https://example.com/notes) first")).toEqual(['"href":"https://example.com/notes"']);
  });

  it("should paste an unsafe link as its words when its address is refused", () => {
    const nodes = withoutUnsafeLinks(parseMarkdownFragment("Run [this](javascript:alert(1)) **now**"));
    expect(JSON.stringify(nodes)).not.toContain("javascript");
    expect(JSON.stringify(nodes)).toContain('"text":"this"');
    expect(JSON.stringify(nodes)).toContain('"type":"bold"');
  });
});
