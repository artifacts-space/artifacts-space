import type { JSONContent } from "@tiptap/core";

/*
 * Test support: list documents made from a seed, the same ones on every
 * run, and the edits a person makes to a list. The documents hold bulleted,
 * numbered, and task lists (and lists that mix task and plain items), tight
 * and loose, up to four lists deep, with paragraphs, code blocks, quotes,
 * tables, and nested lists in their items, and the spacing people and agents
 * really write: spaces at the end of a line, two blank lines between items,
 * two spaces or a tab after a marker, a child indented with a tab, items
 * with no text, and a list right under another, set less far in.
 */

/** A source of numbers from 0 up to 1, the same sequence for the same seed. */
export type Random = () => number;

/** The numbers for `seed`. */
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

const words = ["alpha", "beta", "gamma", "step 3", "see `code`", "**bold** text", "a [link](https://example.com)", "2 * 3", "snake_case", "Q&A"];
const codeLines = ["run [^a]", "x = 1", "- not a list", "1. no"];

function extraLines(random: Random, indent: string, depth: number): string[] {
  const kind = pick(random, ["paragraph", "code", "code", "quote", "table", "nested", "nested"] as const);
  if (kind === "paragraph") return [`${indent}${pick(random, words)} more`];
  if (kind === "code") return [`${indent}\`\`\`${pick(random, ["", "text", "sh"])}`, `${indent}${pick(random, codeLines)}`, `${indent}\`\`\``];
  if (kind === "quote") return [`${indent}> ${pick(random, words)}`];
  if (kind === "table") return [`${indent}| name | ${pick(random, words)} |`, `${indent}| --- | --- |`, `${indent}| one | ${pick(random, codeLines)} |`];
  // Now and then a child indented with a tab, as some editors write one.
  if (depth === 0 && random() < 0.05) return [`\t- tabbed ${pick(random, words)}`];
  return depth < 3 ? listLines(random, indent, depth + 1) : [];
}

function itemBody(random: Random, indent: string, depth: number): string[] {
  const loose = random() < 0.5;
  const lines: string[] = [];
  for (let count = Math.floor(random() * 3); count > 0; count -= 1) {
    const extra = extraLines(random, indent, depth);
    if (extra.length === 0) continue;
    // A paragraph or a table needs a blank line above it, or it joins the text before.
    if (loose || !/^\s*(`|>|[-+*] |\d+[.)] )/.test(extra[0] ?? "")) lines.push("");
    lines.push(...extra);
  }
  return lines;
}

function marker(random: Random, kind: string, number: number): string {
  if (kind === "task" || (kind === "mixed" && random() < 0.5)) return `- [${random() < 0.3 ? "x" : " "}]`;
  if (kind === "mixed") return "-";
  if (kind === "dot") return `${String(number)}.`;
  if (kind === "paren") return `${String(number)})`;
  return kind === "ones" ? "1." : kind;
}

type ItemShape = "plain" | "wide" | "tab" | "empty" | "emptyNested";
const itemShapes: readonly ItemShape[] = ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "wide", "tab", "empty", "emptyNested"];

/** The lines of an item with a tab after its marker or with no text, or null when the item is not one of those. */
function oddItem(random: Random, shape: ItemShape, indent: string, mark: string, index: number, depth: number): string[] | null {
  if (shape === "tab" && depth === 0) return [`${indent}${mark}\t${pick(random, words)} ${String(index)}`];
  if (mark.startsWith("- [")) return null;
  if (shape === "empty") return [`${indent}${mark}`];
  if (shape === "emptyNested" && depth < 3) return [`${indent}${mark}`, `${indent}${" ".repeat(mark.length + 1)}- child ${String(index)}`];
  return null;
}

/** One item's lines: its marker and text, with the odd spacing people write, then its other blocks. */
function itemLines(random: Random, indent: string, mark: string, index: number, depth: number): string[] {
  const task = mark.startsWith("- [");
  const shape = pick(random, itemShapes);
  const odd = oddItem(random, shape, indent, mark, index, depth);
  if (odd) return odd;
  const gap = shape === "wide" && !task ? "  " : " ";
  const tail = pick(random, ["", "", "", "", "", " ", "  "]);
  const inner = `${indent}${" ".repeat(task ? 2 : mark.length + gap.length)}`;
  return [`${indent}${mark}${gap}${pick(random, words)} ${String(index)}${tail}`, ...itemBody(random, inner, depth)];
}

function listLines(random: Random, indent: string, depth: number): string[] {
  const kind = pick(random, ["-", "*", "+", "task", "task", "mixed", "dot", "paren", "ones"] as const);
  const loose = random() < 0.4;
  const start = pick(random, [1, 1, 1, 3, 9]);
  const lines: string[] = [];
  for (let index = 0, count = 1 + Math.floor(random() * 4); index < count; index += 1) {
    if (index > 0 && loose) lines.push(...(random() < 0.15 ? ["", ""] : [""]));
    lines.push(...itemLines(random, indent, marker(random, kind, start + index), index, depth));
  }
  return lines;
}

const below = ["  * sub", "  + sub", "  2. two", " - [ ] under", "   1) deeper", "2. two", "+ plus"];
const apart = ["   - [x] apart", "  * apart", "   indented text"];

/**
 * What stands right under a list now and then: another list, set less far
 * in than the item above it, so it is a block of its own (`1. one` then
 * `  * sub`), or an indented block after a blank line. An edit to the list
 * above can make such a block part of it.
 */
function attached(random: Random): string {
  const chance = random();
  if (chance < 0.08) return `\n${pick(random, below)}`;
  if (chance < 0.12) return `\n${pick(random, below)}\n${pick(random, below)}`;
  return chance < 0.16 ? `\n\n${pick(random, apart)}` : "";
}

/** A document of one to three lists with a paragraph or a heading after each. */
export function generatedLists(random: Random): string {
  const blocks: string[] = [];
  for (let index = 0, count = 1 + Math.floor(random() * 3); index < count; index += 1) {
    blocks.push(`${listLines(random, "", 0).join("\n")}${attached(random)}`, index % 2 === 0 ? `Between ${String(index)}.` : `## Heading ${String(index)}`);
  }
  return `${blocks.join("\n\n")}\n`;
}

/** Every node of one of `types` under `node`, in document order. */
export function every(node: JSONContent, types: readonly string[], found: JSONContent[] = []): JSONContent[] {
  if (types.includes(node.type ?? "")) found.push(node);
  for (const child of node.content ?? []) every(child, types, found);
  return found;
}

const listNames = ["bulletList", "orderedList", "taskList"] as const;
const itemNames = ["listItem", "taskItem"] as const;

function paragraph(text?: string): JSONContent {
  return text === undefined ? { type: "paragraph", attrs: { color: null, background: null } } : { type: "paragraph", attrs: { color: null, background: null }, content: [{ type: "text", text }] };
}

/** A new item for the list, holding `blocks`, put at a place picked at random. */
function insertItem(list: JSONContent, random: Random, blocks: JSONContent[]) {
  const item: JSONContent = list.type === "taskList" ? { type: "taskItem", attrs: { checked: false }, content: blocks } : { type: "listItem", content: blocks };
  const items = list.content ?? [];
  items.splice(Math.floor(random() * (items.length + 1)), 0, item);
  list.content = items;
}

/** A list picked at random, or nothing when the document has none (with `atLeast` items). */
function someList(doc: JSONContent, random: Random, atLeast = 0): JSONContent | undefined {
  const lists = every(doc, listNames).filter((list) => (list.content ?? []).length >= atLeast);
  return lists.length > 0 ? pick(random, lists) : undefined;
}

/** The first paragraph of an item picked at random. */
function someItemText(doc: JSONContent, random: Random): JSONContent | undefined {
  const paragraphs = every(doc, itemNames).flatMap((item) => (item.content?.[0]?.type === "paragraph" ? [item.content[0]] : []));
  return paragraphs.length > 0 ? pick(random, paragraphs) : undefined;
}

/** An edit to a loaded document; false when the document has nothing to edit that way. */
export type ListEdit = (doc: JSONContent, random: Random) => boolean;

function withList(atLeast: number, change: (list: JSONContent, random: Random) => void): ListEdit {
  return (doc, random) => {
    const list = someList(doc, random, atLeast);
    if (list) change(list, random);
    return list !== undefined;
  };
}

function withItemText(change: (paragraph: JSONContent, random: Random) => void): ListEdit {
  return (doc, random) => {
    const text = someItemText(doc, random);
    if (text) change(text, random);
    return text !== undefined;
  };
}

/** The edits a person makes to a list, by name. */
export const listEdits: Readonly<Record<string, ListEdit>> = {
  tick: (doc, random) => {
    const tasks = every(doc, ["taskItem"]);
    if (tasks.length === 0) return false;
    const task = pick(random, tasks);
    task.attrs = { ...task.attrs, checked: task.attrs?.checked !== true };
    return true;
  },
  word: withItemText((text) => { text.content = [...(text.content ?? []), { type: "text", text: " edited" }]; }),
  // A space typed at the end of an item, as while a sentence is typed.
  space: withItemText((text) => { text.content = [...(text.content ?? []), { type: "text", text: " " }]; }),
  // Shift+Enter at the end of an item, and in the middle of one.
  breakAtEnd: withItemText((text) => { text.content = [...(text.content ?? []), { type: "hardBreak" }]; }),
  breakInside: withItemText((text) => { text.content = [...(text.content ?? []), { type: "hardBreak" }, { type: "text", text: "next line" }]; }),
  remove: withList(2, (list, random) => { list.content?.splice(Math.floor(random() * (list.content.length)), 1); }),
  add: withList(0, (list, random) => { insertItem(list, random, [paragraph("new item")]); }),
  // Enter pressed before a space: the new item's text starts with it.
  addWithSpace: withList(0, (list, random) => { insertItem(list, random, [paragraph(" spaced item")]); }),
  blank: withList(0, (list, random) => { insertItem(list, random, [paragraph()]); }),
  blankWithNested: withList(0, (list, random) => { insertItem(list, random, [paragraph(), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("child")] }] }]); }),
  move: withList(2, (list, random) => {
    const items = list.content ?? [];
    const from = Math.floor(random() * items.length);
    const [item] = items.splice(from, 1);
    const to = (from + 1 + Math.floor(random() * items.length)) % (items.length + 1);
    if (item) items.splice(to === from ? items.length : to, 0, item);
  }),
  // Tab on an item: it becomes a list inside the item above it.
  indent: withList(2, (list, random) => {
    const items = list.content ?? [];
    const at = 1 + Math.floor(random() * (items.length - 1));
    const [item] = items.splice(at, 1);
    const above = items[at - 1];
    if (item && above) above.content = [...(above.content ?? []), { type: list.type ?? "bulletList", content: [item] }];
  }),
};
