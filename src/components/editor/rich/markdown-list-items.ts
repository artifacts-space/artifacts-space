import type { JSONContent } from "@tiptap/core";

/*
 * Lists keep their items as written. A list loads as one block of the
 * source; this file cuts that block into its items, so a save after an edit
 * writes back every item nobody touched byte for byte, and changes only the
 * item that was edited. Ticking a task box changes one character.
 */

const listTypes: ReadonlySet<string> = new Set(["bulletList", "orderedList", "taskList"]);

/** True for a bulleted, numbered, or task list node. */
export function isListNode(node: JSONContent | undefined): node is JSONContent {
  return node?.type !== undefined && listTypes.has(node.type);
}

/** One item of a list as written. */
export interface ItemSlice {
  /** The item's source, without the blank lines after it. */
  text: string;
  /** The whitespace between this item and the next; empty for the last item. */
  after: string;
  /** What starts the item's first line: indent, marker, spaces, and a task box (`- [ ] `). */
  marker: string;
  /** How far the item's other lines are indented. */
  indent: number;
  /** The item's content without its marker and indent: Markdown for its blocks. */
  content: string;
  /** Where the task box's mark (` `, `x`, or `X`) sits in `text`, or null. */
  box: number | null;
}

/** A list marker that starts an item with text after it (CommonMark: up to 3 spaces before, 1–4 after). */
const itemStart = /^( {0,3})([-+*]|\d{1,9}[.)])( {1,4})(?=\S)/;
const taskBox = /^\[[ xX]\] /;

function leadingSpaces(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

/** The item's other lines without its indent; null when a line is indented with tabs. */
function dedent(lines: readonly string[], indent: number): string[] | null {
  const result: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      result.push("");
      continue;
    }
    if (/^ *\t/.test(line)) return null;
    result.push(line.slice(Math.min(indent, leadingSpaces(line))));
  }
  return result;
}

/** One item's slice from its lines; `last` items keep no whitespace after them. */
function sliceItem(lines: readonly string[], last: boolean): ItemSlice | null {
  const full = last ? lines.join("\n") : `${lines.join("\n")}\n`;
  const text = full.replace(/\s+$/, "");
  const [first = "", ...rest] = text.split("\n");
  const start = itemStart.exec(first);
  if (!start) return null;
  const indent = start[0].length;
  const boxed = taskBox.test(first.slice(indent));
  const marker = first.slice(0, boxed ? indent + 4 : indent);
  const restLines = dedent(rest, indent);
  if (!restLines) return null;
  return {
    text,
    after: full.slice(text.length),
    marker,
    indent,
    content: [first.slice(marker.length), ...restLines].join("\n"),
    box: boxed ? indent + 1 : null,
  };
}

/** Line numbers where items start: a marker at the first item's indent. */
function itemStarts(lines: readonly string[]): number[] | null {
  const base = itemStart.exec(lines[0] ?? "")?.[1]?.length;
  if (base === undefined) return null;
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (itemStart.exec(line)?.[1]?.length === base) starts.push(index);
  });
  return starts;
}

/**
 * Cuts a list block's source into its items. Returns null when the source
 * is not one plain list the cut can follow (tab indents, a marker with no
 * text after it, or code indented right after the marker).
 */
export function splitListItems(text: string): ItemSlice[] | null {
  const lines = text.split("\n");
  const starts = itemStarts(lines);
  if (!starts) return null;
  const slices: ItemSlice[] = [];
  for (const [position, start] of starts.entries()) {
    const end = starts[position + 1] ?? lines.length;
    const slice = sliceItem(lines.slice(start, end), end === lines.length);
    if (!slice) return null;
    slices.push(slice);
  }
  return slices;
}

/** A loaded item: its slice, the key of the node it became, and the map of its content. */
export interface ItemSource<Map> extends ItemSlice {
  key: string;
  /** The source map of the item's content, so its unedited blocks stay as written; null when it has none. */
  children: Map | null;
}

/** A loaded list block, item by item. */
export interface ListSource<Map> {
  type: string;
  items: ItemSource<Map>[];
}

/** What composing a list needs from the round trip. */
export interface ListWriter<Map> {
  key: (node: JSONContent) => string;
  /** Markdown for an item's content, keeping blocks that match `map` as written. */
  children: (content: JSONContent[], map: Map) => string;
  /** Fresh Markdown for a list node. */
  fresh: (list: JSONContent) => string;
}

function isChecked(item: JSONContent): boolean {
  return item.attrs?.checked === true;
}

/** The mark a task box gets: a checked box keeps its `x` or `X`. */
function boxMark(item: JSONContent, written: string): string {
  if (!isChecked(item)) return " ";
  return written === " " ? "x" : written;
}

/** The item's source with its task box set to the item's state. */
function withBox(source: ItemSlice, item: JSONContent): string {
  if (source.box === null || item.type !== "taskItem") return source.text;
  const mark = boxMark(item, source.text.charAt(source.box));
  return `${source.text.slice(0, source.box)}${mark}${source.text.slice(source.box + 1)}`;
}

function markerFor(source: ItemSlice, item: JSONContent): string {
  return withBox({ ...source, text: source.marker }, item);
}

/** Content written under a marker, with its other lines indented. */
function underMarker(marker: string, indent: number, content: string): string {
  const [first = "", ...rest] = content.split("\n");
  const pad = " ".repeat(indent);
  return [`${marker}${first}`, ...rest.map((line) => (line ? `${pad}${line}` : ""))].join("\n");
}

/** The item as it was loaded, apart from its task box, for telling a ticked box from an edit. */
function asLoaded(item: JSONContent, source: ItemSlice): JSONContent {
  if (source.box === null || item.type !== "taskItem") return item;
  return { ...item, attrs: { ...item.attrs, checked: source.text.charAt(source.box) !== " " } };
}

/** An edited item written over its source: unedited content keeps its bytes. Null when it cannot be. */
function editedItem<Map>(item: JSONContent, source: ItemSource<Map>, writer: ListWriter<Map>): string | null {
  if (writer.key(asLoaded(item, source)) === source.key) return withBox(source, item);
  if (source.children === null) return null;
  const content = writer.children(item.content ?? [], source.children).replace(/\n+$/, "");
  if (content === source.content) return withBox(source, item);
  return underMarker(markerFor(source, item), source.indent, content);
}

/** The list's own marker style: its bullet, or its number delimiter. */
function restyled(fresh: string, list: ListSource<unknown>): string {
  const first = list.items[0]?.marker.trimStart() ?? "-";
  const delimiter = /^\d+([.)])/.exec(first)?.[1];
  if (delimiter) return fresh.replace(/^(\s*\d+)\./, `$1${delimiter}`);
  return fresh.replace(/^(\s*)-/, `$1${first.charAt(0)}`);
}

function numberOf(text: string | undefined): number | null {
  const digits = /^\s*(\d+)/.exec(text ?? "")?.[1];
  return digits === undefined ? null : Number(digits);
}

/** The number for a new item: the list's one number when every item has it, or the one after the item before. */
function newNumber(list: ListSource<unknown>, previous: string | undefined, start: number): number {
  const numbers = new Set(list.items.map((item) => numberOf(item.marker)));
  const [only] = numbers;
  if (numbers.size === 1 && typeof only === "number" && list.items.length > 1) return only;
  const before = numberOf(previous);
  return before === null ? start : before + 1;
}

/** A new item, written fresh in the list's marker style. */
function newItem<Map>(item: JSONContent, node: JSONContent, list: ListSource<Map>, previous: string | undefined, writer: ListWriter<Map>): string {
  const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
  const attrs = node.type === "orderedList" ? { ...node.attrs, start: newNumber(list, previous, start) } : node.attrs;
  return restyled(writer.fresh({ ...node, ...(attrs ? { attrs } : {}), content: [item] }), list);
}

/** A written item and the loaded item it stands in for (-1 for a new one). */
interface Part {
  text: string;
  index: number;
}

/** The first unused loaded item with `key`, preferring those from `from` on. */
function findItem(items: readonly { key: string }[], key: string, from: number, used: ReadonlySet<number>): number {
  const matches = items.flatMap((item, index) => (item.key === key && !used.has(index) ? [index] : []));
  return matches.find((index) => index >= from) ?? matches[0] ?? -1;
}

/** The loaded item an edited item replaces: the next unused one, unless a later item still matches it as written. */
function replacedItem<Map>(list: ListSource<Map>, next: number, used: ReadonlySet<number>, laterKeys: ReadonlySet<string>): number {
  const candidate = list.items[next];
  if (!candidate || used.has(next) || laterKeys.has(candidate.key)) return -1;
  return next;
}

function separatorFor(list: ListSource<unknown>, before: Part, part: Part): string {
  const loaded = list.items[before.index];
  if (loaded && part.index === before.index + 1) return loaded.after;
  return list.items.find((item) => item.after)?.after ?? "\n";
}

function joinParts(parts: readonly Part[], list: ListSource<unknown>): string {
  return parts.map((part, position) => {
    const before = parts[position - 1];
    return before ? `${separatorFor(list, before, part)}${part.text}` : part.text;
  }).join("");
}

/**
 * Writes an edited list over the list it was loaded from: items nobody
 * touched keep their source and the blank lines between them, an edited
 * item keeps its marker and indent (and its unedited blocks), and a new
 * item is written in the list's marker style. Returns null when an edited
 * item cannot be written this way; the caller then writes the list fresh.
 */
export function composeList<Map>(node: JSONContent, list: ListSource<Map>, writer: ListWriter<Map>): string | null {
  const items = node.content ?? [];
  const keys = items.map((item) => writer.key(item));
  const used = new Set<number>();
  const parts: Part[] = [];
  let next = 0;
  for (const [position, item] of items.entries()) {
    const exact = findItem(list.items, keys[position] ?? "", next, used);
    const index = exact >= 0 ? exact : replacedItem(list, next, used, new Set(keys.slice(position + 1)));
    const loaded = list.items[index];
    const text = loaded ? (exact >= 0 ? loaded.text : editedItem(item, loaded, writer)) : newItem(item, node, list, parts.at(-1)?.text, writer);
    if (text === null) return null;
    if (index >= 0) {
      used.add(index);
      next = index + 1;
    }
    parts.push({ text, index });
  }
  return joinParts(parts, list);
}
