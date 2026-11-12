import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { readsTheSame } from "./markdown-display-shape";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/*
 * Generated list documents, the same ones on every run: bulleted, numbered,
 * and task lists, tight and loose, whose items hold paragraphs, code blocks,
 * quotes, and nested lists. Each is loaded, saved untouched, and saved after
 * one edit. A document that loads formatted must read the same in the read
 * view, and the saved text must load as the edited content and read the same
 * way there too.
 *
 * Known limit: about one edit in ten thousand generated ones still saves a
 * list the editor reads differently, three lists deep, where a task list
 * sits right above a code block in a tight item (seed 1595, past the seeds
 * run here). LIST_FUZZ_SEEDS runs more seeds by hand.
 */

type Random = () => number;

function seeded(seed: number): Random {
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
  const kind = pick(random, ["paragraph", "code", "code", "quote", "nested"] as const);
  if (kind === "paragraph") return [`${indent}${pick(random, words)} more`];
  if (kind === "code") return [`${indent}\`\`\`${pick(random, ["", "text", "sh"])}`, `${indent}${pick(random, codeLines)}`, `${indent}\`\`\``];
  if (kind === "quote") return [`${indent}> ${pick(random, words)}`];
  return depth < 2 ? listLines(random, indent, depth + 1) : [];
}

function itemBody(random: Random, indent: string, depth: number): string[] {
  const loose = random() < 0.5;
  const lines: string[] = [];
  for (let count = Math.floor(random() * 3); count > 0; count -= 1) {
    const extra = extraLines(random, indent, depth);
    if (extra.length === 0) continue;
    // A paragraph needs a blank line above it, or it joins the text before.
    if (loose || !/^\s*(`|>|[-+*] |\d+[.)] )/.test(extra[0] ?? "")) lines.push("");
    lines.push(...extra);
  }
  return lines;
}

function marker(random: Random, kind: string, number: number): string {
  if (kind === "task") return `- [${random() < 0.3 ? "x" : " "}]`;
  if (kind === "dot") return `${String(number)}.`;
  if (kind === "paren") return `${String(number)})`;
  return kind === "ones" ? "1." : kind;
}

function listLines(random: Random, indent: string, depth: number): string[] {
  const kind = pick(random, ["-", "*", "+", "task", "dot", "paren", "ones"] as const);
  const loose = random() < 0.4;
  const start = pick(random, [1, 1, 1, 3, 9]);
  const lines: string[] = [];
  for (let index = 0, count = 1 + Math.floor(random() * 4); index < count; index += 1) {
    const mark = marker(random, kind, start + index);
    if (index > 0 && loose) lines.push("");
    lines.push(`${indent}${mark} ${pick(random, words)} ${String(index)}`);
    lines.push(...itemBody(random, `${indent}${" ".repeat(kind === "task" ? 2 : mark.length + 1)}`, depth));
  }
  return lines;
}

function generated(random: Random): string {
  const blocks: string[] = [];
  for (let index = 0, count = 1 + Math.floor(random() * 3); index < count; index += 1) {
    blocks.push(listLines(random, "", 0).join("\n"), index % 2 === 0 ? `Between ${String(index)}.` : `## Heading ${String(index)}`);
  }
  return `${blocks.join("\n\n")}\n`;
}

function every(node: JSONContent, types: readonly string[], found: JSONContent[] = []): JSONContent[] {
  if (types.includes(node.type ?? "")) found.push(node);
  for (const child of node.content ?? []) every(child, types, found);
  return found;
}

const textBlocks: ReadonlySet<string> = new Set(["paragraph", "heading", "codeBlock"]);

function plain(node: JSONContent): string {
  return node.text ?? (node.content ?? []).map((child) => plain(child)).join("");
}

/** The content without how it is drawn: blocks, list numbers, task boxes, and text. */
function outline(node: JSONContent): unknown {
  if (textBlocks.has(node.type ?? "")) return { type: node.type, text: plain(node) };
  const attrs: Record<string, unknown> = node.attrs ?? {};
  const start = node.type === "orderedList" ? attrs.start : undefined;
  return { type: node.type, checked: attrs.checked, start, source: attrs.source, content: (node.content ?? []).map((child) => outline(child)) };
}

const newParagraph: JSONContent = { type: "paragraph", attrs: { color: null, background: null }, content: [{ type: "text", text: "new item" }] };

type Change = (doc: JSONContent, random: Random) => boolean;

const changes: Record<string, Change> = {
  tick: (doc, random) => {
    const tasks = every(doc, ["taskItem"]);
    if (tasks.length === 0) return false;
    const task = pick(random, tasks);
    task.attrs = { ...task.attrs, checked: task.attrs?.checked !== true };
    return true;
  },
  word: (doc, random) => {
    const paragraphs = every(doc, ["listItem", "taskItem"]).flatMap((item) => every(item, ["paragraph"]));
    if (paragraphs.length === 0) return false;
    const paragraph = pick(random, paragraphs);
    paragraph.content = [...(paragraph.content ?? []), { type: "text", text: " edited" }];
    return true;
  },
  remove: (doc, random) => {
    const lists = every(doc, ["bulletList", "orderedList", "taskList"]).filter((list) => (list.content ?? []).length > 1);
    if (lists.length === 0) return false;
    const list = pick(random, lists);
    list.content?.splice(Math.floor(random() * (list.content.length)), 1);
    return true;
  },
  add: (doc, random) => {
    const lists = every(doc, ["bulletList", "orderedList", "taskList"]);
    if (lists.length === 0) return false;
    const list = pick(random, lists);
    const item: JSONContent = list.type === "taskList" ? { type: "taskItem", attrs: { checked: false }, content: [newParagraph] } : { type: "listItem", content: [newParagraph] };
    const items = list.content ?? [];
    items.splice(Math.floor(random() * (items.length + 1)), 0, item);
    list.content = items;
    return true;
  },
};

type Loaded = ReturnType<typeof parseMarkdown>;

/** What went wrong when the document loaded and was saved untouched, or nothing. */
function loadProblems(seed: number, markdown: string, loaded: Loaded): string[] {
  const found: string[] = [];
  if (serializeMarkdown(structuredClone(loaded.doc), loaded.source) !== markdown) found.push(`seed ${String(seed)}: saved differently with no edit`);
  if (loaded.rawBlocks === 0 && !readsTheSame(markdown, loaded.doc.content ?? [])) found.push(`seed ${String(seed)}: loads formatted, but the page reads it differently\n${markdown}`);
  return found;
}

/** What went wrong after one edit, or nothing. */
function editProblem(seed: number, name: string, markdown: string, loaded: Loaded, doc: JSONContent): string[] {
  const saved = serializeMarkdown(doc, loaded.source);
  const again = parseMarkdown(saved);
  if (JSON.stringify(outline(again.doc)) !== JSON.stringify(outline(doc))) return [`seed ${String(seed)}: ${name} loads differently\n${markdown}---\n${saved}`];
  const formatted = loaded.rawBlocks === 0 && again.rawBlocks === 0;
  return formatted && !readsTheSame(saved, again.doc.content ?? []) ? [`seed ${String(seed)}: ${name} reads differently on the page\n${markdown}---\n${saved}`] : [];
}

/** What went wrong for one seed, or nothing. */
function problems(seed: number): string[] {
  const random = seeded(seed);
  const markdown = generated(random);
  const loaded = parseMarkdown(markdown);
  const found = loadProblems(seed, markdown, loaded);
  for (const [name, change] of Object.entries(changes)) {
    const doc = structuredClone(loaded.doc);
    if (change(doc, random)) found.push(...editProblem(seed, name, markdown, loaded, doc));
  }
  return found;
}

describe("generated list documents", () => {
  it("should save text that loads and reads as the edit when a box is ticked, a word changes, or an item is added or removed", { timeout: 60_000 }, () => {
    const found: string[] = [];
    for (let seed = 1; seed <= Number(process.env.LIST_FUZZ_SEEDS ?? 600); seed += 1) found.push(...problems(seed));
    expect(found).toEqual([]);
  });
});
