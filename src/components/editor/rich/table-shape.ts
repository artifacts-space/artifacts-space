import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { TableMap } from "@tiptap/pm/tables";

/*
 * A GFM pipe table stores a grid of one-line cells under one header row:
 * no merged cells, no header cells below the first row, and only inline
 * text in a cell (a line break is `<br>`, markdown-cell-breaks.ts). Tiptap's
 * table holds more than that: Enter splits a cell into paragraphs, a paste
 * from a word processor brings merged cells and header columns, and a
 * pasted list or code block lands in a cell. The writer then wrote a
 * merged cell's neighbours into the wrong columns and blocks as literal
 * text. So the editor keeps every table in the shape Markdown stores, at
 * once, and shows what will be saved.
 */

const TABLE = "table";
const HEADER = "tableHeader";
const CELL = "tableCell";
const MEDIA = "media";

function isCell(node: ProseMirrorNode): boolean {
  return node.type.name === HEADER || node.type.name === CELL;
}

/** The cell type a row of a stored table holds: header cells in the first row, plain cells below. */
function cellTypeName(row: number): string {
  return row === 0 ? HEADER : CELL;
}

/** True when a cell holds one paragraph and nothing else, as a stored cell does. */
function hasOneParagraph(cell: ProseMirrorNode): boolean {
  return cell.childCount === 1 && cell.firstChild?.type.name === "paragraph";
}

/** True when a cell holds only paragraphs, which join with line breaks where they meet. */
function hasOnlyParagraphs(cell: ProseMirrorNode): boolean {
  let only = cell.childCount > 0;
  cell.forEach((child) => {
    if (child.type.name !== "paragraph") only = false;
  });
  return only;
}

function hasSpans(table: ProseMirrorNode): boolean {
  let spans = false;
  table.descendants((node) => {
    if (isCell(node) && (Number(node.attrs.colspan) > 1 || Number(node.attrs.rowspan) > 1)) spans = true;
    return !spans && !isCell(node);
  });
  return spans;
}

/** The inline pieces of one block in a cell: a list of lines, and the media it holds. */
interface Flattened {
  lines: ProseMirrorNode[][];
  media: ProseMirrorNode[];
}

function codeLines(block: ProseMirrorNode, schema: Schema): ProseMirrorNode[][] {
  const code = schema.marks.code;
  return block.textContent.split("\n").map((line) => (line ? [schema.text(line, code ? [code.create()] : [])] : []));
}

function inlineChildren(block: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  block.forEach((child) => children.push(child));
  return children;
}

/** A block's text as lines of inline nodes, and any media in it, for a cell that may hold only text. */
function flatten(block: ProseMirrorNode, schema: Schema, into: Flattened): void {
  if (block.type.name === MEDIA) {
    into.media.push(block);
    return;
  }
  if (block.type.name === "codeBlock") {
    into.lines.push(...codeLines(block, schema));
    return;
  }
  if (block.isTextblock) {
    into.lines.push(inlineChildren(block));
    return;
  }
  const source: unknown = block.attrs.source;
  if (block.isAtom && typeof source === "string") {
    into.lines.push(...source.split("\n").map((line) => (line ? [schema.text(line)] : [])));
    return;
  }
  block.forEach((child) => { flatten(child, schema, into); });
}

function paragraphType(schema: Schema) {
  const type = schema.nodes.paragraph;
  if (!type) throw new Error("The schema has no paragraph");
  return type;
}

/** Lines of inline nodes as one paragraph, with a line break where two lines meet. */
function joinedParagraph(lines: readonly ProseMirrorNode[][], schema: Schema): ProseMirrorNode {
  const hardBreak = schema.nodes.hardBreak;
  const content = lines.flatMap((line, index) => (index > 0 && hardBreak ? [hardBreak.create(), ...line] : line));
  return paragraphType(schema).create(null, content);
}

/** A cell's content as the one paragraph a stored cell holds, and the media taken out of it. */
export function cellParagraph(cell: ProseMirrorNode, schema: Schema): { paragraph: ProseMirrorNode; media: ProseMirrorNode[] } {
  const flattened: Flattened = { lines: [], media: [] };
  cell.forEach((child) => { flatten(child, schema, flattened); });
  return { paragraph: joinedParagraph(flattened.lines, schema), media: flattened.media };
}

function plainCell(type: string, cell: ProseMirrorNode | null, schema: Schema, media: ProseMirrorNode[]): ProseMirrorNode {
  const nodeType = schema.nodes[type] ?? schema.nodes.tableCell;
  if (!nodeType) throw new Error("The schema has no table cell");
  const attrs = { ...(cell?.attrs ?? {}), colspan: 1, rowspan: 1, colwidth: null };
  if (!cell) return nodeType.create(attrs, paragraphType(schema).create());
  const shaped = cellParagraph(cell, schema);
  media.push(...shaped.media);
  return nodeType.create(attrs, shaped.paragraph);
}

/**
 * A table with merged cells as the grid Markdown stores: a merged cell's
 * content in its top-left place, and an empty cell in each place it
 * covered, so no neighbour moves to another column. Header cells only in
 * the first row, and every cell one paragraph.
 */
export function expandedTable(table: ProseMirrorNode, schema: Schema): { table: ProseMirrorNode; media: ProseMirrorNode[] } {
  const map = TableMap.get(table);
  const media: ProseMirrorNode[] = [];
  const rows: ProseMirrorNode[] = [];
  for (let row = 0; row < map.height; row += 1) {
    const cells: ProseMirrorNode[] = [];
    for (let column = 0; column < map.width; column += 1) {
      const offset = map.map[row * map.width + column] ?? 0;
      const rect = map.findCell(offset);
      const startsHere = rect.left === column && rect.top === row;
      cells.push(plainCell(cellTypeName(row), startsHere ? table.nodeAt(offset) : null, schema, media));
    }
    rows.push(schema.nodes.tableRow?.create(null, cells) ?? table.child(row));
  }
  return { table: table.type.create(table.attrs, rows), media };
}

/** Positions of every table in the document, last first, so a change to one leaves the others' positions as they were. */
function tablesLastFirst(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === TABLE) positions.push(pos);
    return !node.isTextblock && !isCell(node);
  });
  return positions.reverse();
}

/** Joins the paragraphs of a cell where they meet with a line break; a caret at the start of a joined paragraph lands after the break. */
function joinParagraphs(tr: Transaction, cell: ProseMirrorNode, cellPos: number): void {
  const hardBreak = tr.doc.type.schema.nodes.hardBreak;
  if (!hardBreak) return;
  const boundaries: number[] = [];
  let offset = cellPos + 1;
  cell.forEach((child, _offset, index) => {
    offset += child.nodeSize;
    if (index < cell.childCount - 1) boundaries.push(offset);
  });
  for (const boundary of boundaries.reverse()) tr.replaceWith(boundary - 1, boundary + 1, hardBreak.create());
}

/** Gives one cell the type its row stores and one paragraph of content; returns media taken out of it. */
function shapeCell(tr: Transaction, cellPos: number, row: number): ProseMirrorNode[] {
  const schema = tr.doc.type.schema;
  const cell = tr.doc.nodeAt(cellPos);
  if (!cell) return [];
  const type = schema.nodes[cellTypeName(row)];
  if (type && cell.type !== type) tr.setNodeMarkup(cellPos, type, cell.attrs);
  if (hasOneParagraph(cell)) return [];
  if (hasOnlyParagraphs(cell)) {
    joinParagraphs(tr, cell, cellPos);
    return [];
  }
  const shaped = cellParagraph(cell, schema);
  tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, shaped.paragraph);
  return shaped.media;
}

/** Cell positions of a table with the row each is in, last first. */
function cellsLastFirst(table: ProseMirrorNode, tablePos: number): { pos: number; row: number }[] {
  const cells: { pos: number; row: number }[] = [];
  table.forEach((rowNode, rowOffset, row) => {
    rowNode.forEach((_cell, cellOffset) => cells.push({ pos: tablePos + 1 + rowOffset + 1 + cellOffset, row }));
  });
  return cells.reverse();
}

/** Puts one table in the shape Markdown stores, with any media it held placed after it. */
function shapeTable(tr: Transaction, tablePos: number): void {
  const table = tr.doc.nodeAt(tablePos);
  if (table?.type.name !== TABLE) return;
  let media: ProseMirrorNode[];
  if (hasSpans(table)) {
    const expanded = expandedTable(table, tr.doc.type.schema);
    tr.replaceWith(tablePos, tablePos + table.nodeSize, expanded.table);
    media = expanded.media;
  } else {
    // Cells are shaped last first; their media goes after the table in document order.
    media = cellsLastFirst(table, tablePos).map(({ pos, row }) => shapeCell(tr, pos, row)).reverse().flat();
  }
  const after = tablePos + (tr.doc.nodeAt(tablePos)?.nodeSize ?? 0);
  if (media.length > 0) tr.insert(after, media);
}

/** True when a table is already in the shape Markdown stores. */
export function isStoredShape(table: ProseMirrorNode): boolean {
  if (hasSpans(table)) return false;
  let stored = true;
  table.forEach((row, _offset, index) => {
    row.forEach((cell) => {
      if (cell.type.name !== cellTypeName(index) || !hasOneParagraph(cell)) stored = false;
    });
  });
  return stored;
}

/*
 * The text that starts a block by a Markdown input rule (Tiptap's list,
 * task, heading, quote, code block, and divider rules), typed at the start
 * of a line. In a cell it is text: Markdown reads a cell as one line.
 */
const blockTrigger = /^(?:\s*[-+*]\s|\d+[.)]\s|\s*\[[ xX]?\]\s|#{1,6}\s|\s*>\s|```[a-z]*\s|~~~[a-z]*\s|---|—-|___\s|\*\*\*\s)$/;

function inTableCell(view: EditorView, from: number): boolean {
  const $from = view.state.doc.resolve(from);
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (isCell($from.node(depth))) return true;
  }
  return false;
}

/** True when `text`, typed after `before` at the start of a line, would start a block by a Markdown input rule. */
export function startsBlock(before: string, text: string): boolean {
  return blockTrigger.test(before + text);
}

/** Types a block's Markdown trigger in a table cell as plain text, before any input rule turns it into a block. */
function typedAsText(view: EditorView, from: number, to: number, text: string): boolean {
  if (!inTableCell(view, from)) return false;
  const $from = view.state.doc.resolve(from);
  if (!startsBlock($from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc"), text)) return false;
  view.dispatch(view.state.tr.insertText(text, from, to));
  return true;
}

/** The plugin that keeps tables in the stored shape (see `TableShape`). */
export function tableShapePlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("tableShape"),
    props: { handleTextInput: typedAsText },
    appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const tr = state.tr;
      for (const pos of tablesLastFirst(state.doc)) {
        const table = state.doc.nodeAt(pos);
        if (table && !isStoredShape(table)) shapeTable(tr, pos);
      }
      return tr.docChanged ? tr : null;
    },
  });
}

/**
 * The editor's tables, kept in the shape a GFM pipe table stores after
 * every change: merged cells split into the grid, header cells only in the
 * first row, and each cell one paragraph (paragraphs Enter made are joined
 * with a line break; a pasted list, heading, or code block becomes its
 * lines; media moves to just after the table). Markdown's block triggers
 * typed in a cell (`- `, `# `, `> `) stay text. Changes made here join the
 * change that caused them, so one Undo takes back both.
 */
export const TableShape = Extension.create({
  name: "tableShape",
  // Before the list, heading, quote, and code block extensions, so a block's trigger typed in a cell stays text.
  priority: 1000,
  addProseMirrorPlugins: () => [tableShapePlugin()],
});
