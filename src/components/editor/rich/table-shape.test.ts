import { getSchema, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { emptySourceMap, parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";
import { markdownSchemaExtensions } from "./markdown-schema";
import { isStoredShape, startsBlock, tableShapePlugin } from "./table-shape";

const schema = getSchema(markdownSchemaExtensions());

const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const t = (text: string): JSONContent => ({ type: "text", text });
const cell = (type: string, content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs }, content });
const table = (rows: JSONContent[][]): JSONContent => ({ type: "table", content: rows.map((row) => ({ type: "tableRow", content: row })) });
const head = (...names: string[]) => names.map((name) => cell("tableHeader", [p(t(name))]));
const body = (...texts: string[]) => texts.map((text) => cell("tableCell", [p(t(text))]));

/** A state with the plugin, then a change that puts `content` in place, as a paste would. */
function afterChange(content: JSONContent[]): EditorState {
  const state = EditorState.create({ schema, plugins: [tableShapePlugin()] });
  const doc = schema.nodeFromJSON({ type: "doc", content });
  return state.applyTransaction(state.tr.replaceWith(0, state.doc.content.size, doc.content)).state;
}

function markdownOf(state: EditorState): string {
  return serializeMarkdown(state.doc.toJSON() as JSONContent, emptySourceMap());
}

function firstTable(state: EditorState): ProseMirrorNode {
  const tables: ProseMirrorNode[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === "table") tables.push(node);
  });
  const [table] = tables;
  if (!table) throw new Error("No table");
  return table;
}

/** The text of each cell, row by row, with line breaks as "/". */
function grid(state: EditorState): string[][] {
  const rows: string[][] = [];
  firstTable(state).forEach((row) => {
    const cells: string[] = [];
    row.forEach((node) => cells.push(node.textBetween(0, node.content.size, "|", "/")));
    rows.push(cells);
  });
  return rows;
}

describe("tables kept in the shape Markdown stores", () => {
  it("should join paragraphs in a cell with a line break when Enter split it", () => {
    const state = afterChange([table([head("A", "B"), [cell("tableCell", [p(t("one")), p(t("two"))]), ...body("x")]])]);
    expect(grid(state)).toEqual([["A", "B"], ["one/two", "x"]]);
    expect(isStoredShape(firstTable(state))).toBe(true);
    expect(markdownOf(state)).toContain("| one<br>two |");
  });

  it("should leave the caret after the line break when Enter is pressed in the middle of a cell", () => {
    const start = afterChange([table([head("A"), body("onetwo")])]);
    const caret = findText(start, "onetwo") + 3;
    const placed = start.apply(start.tr.setSelection(TextSelection.create(start.doc, caret)));
    const split = placed.applyTransaction(placed.tr.split(caret)).state;
    expect(grid(split)).toEqual([["A"], ["one/two"]]);
    expect(split.selection.$from.parent.textBetween(0, split.selection.$from.parentOffset, "|", "/")).toBe("one/");
  });

  it("should turn a list, a heading, and a code block in a cell into lines of text", () => {
    const list = { type: "bulletList", content: [{ type: "listItem", content: [p(t("first"))] }, { type: "listItem", content: [p(t("second"))] }] };
    const heading = { type: "heading", attrs: { level: 2 }, content: [t("Title")] };
    const code = { type: "codeBlock", attrs: { language: null }, content: [t("a\nb")] };
    const state = afterChange([table([head("A", "B", "C"), [cell("tableCell", [list]), cell("tableCell", [heading]), cell("tableCell", [code])]])]);
    expect(grid(state)).toEqual([["A", "B", "C"], ["first/second", "Title", "a/b"]]);
    const markdown = markdownOf(state);
    expect(markdown).toContain("| first<br>second | Title | `a`<br>`b` |");
    expect(parseMarkdown(markdown).rawBlocks).toBe(0);
  });

  it("should move media out of a cell to just after the table", () => {
    const media = { type: "media", attrs: { src: "/api/files/0f8fad5b-d9cb-469f-a165-70867728950e", alt: "chart" } };
    const state = afterChange([table([head("A"), [cell("tableCell", [p(t("see below")), media])]]), p(t("after"))]);
    expect(state.doc.child(0).type.name).toBe("table");
    expect(state.doc.child(1).type.name).toBe("media");
    expect(state.doc.child(2).textContent).toBe("after");
    expect(grid(state)).toEqual([["A"], ["see below"]]);
  });

  it("should keep each neighbour in its own column when cells are merged", () => {
    const state = afterChange([
      table([
        head("A", "B", "C"),
        [cell("tableCell", [p(t("wide"))], { colspan: 2 }), ...body("c1")],
        [cell("tableCell", [p(t("tall"))], { rowspan: 2 }), ...body("b2", "c2")],
        body("b3", "c3"),
      ]),
    ]);
    expect(grid(state)).toEqual([["A", "B", "C"], ["wide", "", "c1"], ["tall", "b2", "c2"], ["", "b3", "c3"]]);
    expect(isStoredShape(firstTable(state))).toBe(true);
  });

  it("should put header cells only in the first row when a pasted table has a header column", () => {
    const state = afterChange([table([[cell("tableHeader", [p(t("a"))]), ...body("b")], [cell("tableHeader", [p(t("c"))]), ...body("d")]])]);
    const types: string[][] = [];
    firstTable(state).forEach((row) => {
      const names: string[] = [];
      row.forEach((node) => names.push(node.type.name));
      types.push(names);
    });
    expect(types).toEqual([["tableHeader", "tableHeader"], ["tableCell", "tableCell"]]);
    expect(markdownOf(state)).toMatch(/^\| a +\| b +\|\n\| -+ \| -+ \|\n\| c +\| d +\|\n$/);
  });

  it("should change nothing when every table is already in the stored shape", () => {
    const state = EditorState.create({ doc: schema.nodeFromJSON(parseMarkdown("Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2<br>3 |\n").doc), plugins: [tableShapePlugin()] });
    expect(isStoredShape(firstTable(state))).toBe(true);
    const after = state.applyTransaction(state.tr.insertText("x", 1));
    expect(after.transactions).toHaveLength(1);
  });
});

describe("startsBlock", () => {
  it.each([["", "- "], ["-", " "], ["1.", " "], ["#", " "], ["##", " "], [">", " "], ["```", " "], ["[ ]", " "], ["--", "-"]])("should read %j then %j as a block trigger", (before, text) => {
    expect(startsBlock(before, text)).toBe(true);
  });

  it.each([["a", " "], ["**a*", "*"], ["-a", " "], ["see -", " "]])("should not read %j then %j as a block trigger", (before, text) => {
    expect(startsBlock(before, text)).toBe(false);
  });
});

function findText(state: EditorState, text: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = pos + (node.text.indexOf(text));
    return found < 0;
  });
  return found;
}
