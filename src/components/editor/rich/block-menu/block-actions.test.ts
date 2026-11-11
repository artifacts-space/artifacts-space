import { describe, expect, it } from "vitest";

import { firstRunnable, menuEntries, nextRunnable, searchMenu, shortcutFor, type MenuContext } from "./block-actions";
import { blockTypeName, blockTypes, currentBlockType } from "./block-types";

const paragraph: MenuContext = { changeable: true, currentType: "text", colorable: true, colors: { color: null, background: null }, canMoveUp: true, canMoveDown: true, canLink: true, canComment: true };

const labels = (context: MenuContext, query = "") => searchMenu(query, context).map((entry) => entry.label);

describe("menuEntries", () => {
  it("should list Change, Color, the block actions, then Comment when nothing is typed", () => {
    expect(labels(paragraph)).toEqual(["Change", "Color", "Copy link to block", "Duplicate", "Move up", "Move down", "Delete", "Comment"]);
    expect(menuEntries(paragraph).map((entry) => entry.group)).toEqual([0, 0, 1, 1, 1, 1, 1, 2]);
  });

  it("should leave out Change and Color for blocks without them, and link and comment when the page does not allow them", () => {
    expect(labels({ ...paragraph, changeable: false, currentType: null, colorable: false, canLink: false, canComment: false })).toEqual(["Duplicate", "Move up", "Move down", "Delete"]);
  });

  it("should never offer Ask AI, Suggest edits, or Move to", () => {
    const all = labels(paragraph).join(" ").toLowerCase();
    for (const missing of ["ask", "suggest", "move to", "synced", "page"]) expect(all).not.toContain(missing);
  });

  it("should disable Move up on the first block and Move down on the last", () => {
    const entries = menuEntries({ ...paragraph, canMoveUp: false, canMoveDown: false });
    expect(entries.filter((entry) => entry.disabled).map((entry) => entry.label)).toEqual(["Move up", "Move down"]);
  });

  it("should mark Delete as the destructive row", () => {
    expect(menuEntries(paragraph).filter((entry) => entry.danger).map((entry) => entry.label)).toEqual(["Delete"]);
  });
});

describe("searchMenu", () => {
  it("should find actions by name or keyword when text is typed", () => {
    expect(labels(paragraph, "dup")).toEqual(["Duplicate"]);
    expect(labels(paragraph, "remove")).toEqual(["Delete"]);
    expect(labels(paragraph, "URL")).toEqual(["Copy link to block"]);
    expect(labels(paragraph, "move")).toEqual(["Move up", "Move down"]);
  });

  it("should find submenu entries written out when a type is typed", () => {
    expect(labels(paragraph, "heading 2")).toEqual(["Change to Heading 2"]);
    expect(labels(paragraph, "h3")).toEqual(["Change to Heading 3"]);
    expect(labels(paragraph, "todo")).toEqual(["Change to Task list"]);
  });

  it("should list every other type when Change itself is typed", () => {
    expect(labels(paragraph, "change")).toEqual(["Change", ...blockTypes.filter((type) => type.id !== "text").map((type) => `Change to ${type.label}`)]);
    expect(labels(paragraph, "turn into q")).toEqual(["Change to Quote"]);
  });

  it("should leave out the block's own type when searching types", () => {
    expect(labels({ ...paragraph, currentType: "h2" }, "heading")).toEqual(["Change to Heading 1", "Change to Heading 3"]);
  });

  it("should offer no type changes for blocks Change cannot change", () => {
    expect(labels({ ...paragraph, changeable: false, currentType: null }, "heading")).toEqual([]);
  });

  it("should find nothing when nothing matches", () => {
    expect(labels(paragraph, "zzz")).toEqual([]);
  });
});

describe("firstRunnable and nextRunnable", () => {
  const entries = menuEntries({ ...paragraph, canMoveUp: false });

  it("should skip disabled rows and wrap around", () => {
    expect(firstRunnable(entries)).toBe(0);
    expect(nextRunnable(entries, 3, 1)).toBe(5);
    expect(nextRunnable(entries, 7, 1)).toBe(0);
    expect(nextRunnable(entries, -1, -1)).toBe(7);
    expect(nextRunnable([], -1, 1)).toBe(-1);
  });
});

describe("shortcutFor", () => {
  it("should show Apple keys on a Mac and Ctrl or Alt elsewhere", () => {
    expect(shortcutFor("duplicate", true)).toEqual({ label: "⌘D", binding: "Mod-d" });
    expect(shortcutFor("copyLink", true).label).toBe("⌘⌃L");
    expect(shortcutFor("moveUp", true).label).toBe("⌥⇧↑");
    expect(shortcutFor("comment", false)).toEqual({ label: "Ctrl+Shift+M", binding: "Mod-Shift-m" });
    expect(shortcutFor("delete", false).binding).toBe("");
  });
});

describe("blockTypes", () => {
  it("should offer only the types the editor supports today, in menu order", () => {
    expect(blockTypes.map((type) => type.label)).toEqual(["Text", "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list", "Task list", "Code block", "Quote"]);
    expect(new Set(blockTypes.map((type) => type.id)).size).toBe(blockTypes.length);
  });

  it("should recognise each block's current type", () => {
    expect(currentBlockType({ node: "paragraph" })?.id).toBe("text");
    expect(currentBlockType({ node: "paragraph", list: "bulletList" })?.id).toBe("bullet");
    expect(currentBlockType({ node: "heading", level: 3 })?.id).toBe("h3");
    expect(currentBlockType({ node: "heading", level: 5 })).toBeNull();
    expect(currentBlockType({ node: "codeBlock" })?.id).toBe("code");
    expect(currentBlockType({ node: "table" })).toBeNull();
  });

  it("should name blocks Change does not list when labelling the menu", () => {
    expect(blockTypeName({ node: "table" })).toBe("Table");
    expect(blockTypeName({ node: "horizontalRule" })).toBe("Divider");
    expect(blockTypeName({ node: "media" }, "pdf")).toBe("PDF");
    expect(blockTypeName({ node: "rawMarkdown" })).toBe("Markdown");
    expect(blockTypeName({ node: "heading", level: 5 })).toBe("Block");
    expect(blockTypeName({ node: "blockquote" })).toBe("Quote");
  });
});

describe("color search", () => {
  it("should find text colors and backgrounds by hue when typing", () => {
    expect(labels(paragraph, "pink")).toEqual(["Pink text", "Pink background"]);
    expect(searchMenu("pink background", paragraph)[0]?.command).toEqual({ kind: "color", part: "background", hue: "pink" });
  });

  it("should list every background when typing background, so Enter applies the first one", () => {
    const found = searchMenu("background", paragraph);
    expect(found.map((entry) => entry.label)).toHaveLength(9);
    expect(found[firstRunnable(found)]?.command).toEqual({ kind: "color", part: "background", hue: "gray" });
  });

  it("should find the Color row itself by its name or by colour and highlight", () => {
    expect(labels(paragraph, "colour")[0]).toBe("Color");
    expect(labels(paragraph, "highlight")[0]).toBe("Color");
  });

  it("should leave out the current colors, and offer Default only to remove one", () => {
    const pink = { ...paragraph, colors: { color: "pink", background: null } } as const;
    expect(labels(pink, "pink")).toEqual(["Pink background"]);
    expect(labels(pink, "default")).toEqual(["Default text"]);
    expect(labels(paragraph, "default")).toEqual([]);
  });

  it("should find no colors for blocks without text to color", () => {
    expect(labels({ ...paragraph, colorable: false }, "pink")).toEqual([]);
  });
});
