import type { JSONContent } from "@tiptap/core";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/*
 * The editor reads Markdown with marked; the read view draws it with remark
 * (react-markdown and remark-gfm). Where the two disagree about lists (an
 * empty first item, an item indented past its marker, numbered task items),
 * the editor would show and save something the page does not. This file
 * compares what each reader makes of a block, as a plain outline: block
 * types, list numbers and task boxes, and text without formatting.
 */

/** The few markdown-tree fields the outline reads. */
interface MarkdownNode {
  type: string;
  value?: string;
  alt?: string | null;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  children?: MarkdownNode[];
}

/** One block in the outline. */
interface ItemOutline {
  k: boolean | null;
  c: Outline[];
}

interface Outline {
  t: string;
  x?: string;
  s?: number;
  items?: ItemOutline[];
  c?: Outline[];
  rows?: string[][];
}

const reader = unified().use(remarkParse).use(remarkGfm);

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const skippedInText: ReadonlySet<string> = new Set(["html", "footnoteReference"]);

function markdownText(node: MarkdownNode): string {
  if (skippedInText.has(node.type)) return "";
  if (node.type === "break") return " ";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => markdownText(child)).join("");
}

/** True for a paragraph that holds only images: the editor shows it as a media block. */
function onlyImages(node: MarkdownNode): boolean {
  const children = (node.children ?? []).filter((child) => child.type !== "text" || child.value?.trim());
  return children.length > 0 && children.every((child) => child.type === "image");
}

/** Adjacent lists of the same kind as one: the editor splits a loose task list, and a task list from a plain one. */
function joinLists(blocks: Outline[]): Outline[] {
  const joined: Outline[] = [];
  for (const block of blocks) {
    const last = joined.at(-1);
    if (last?.items && block.items && last.t === block.t) last.items = [...last.items, ...block.items];
    else joined.push(block);
  }
  return joined;
}

function markdownList(node: MarkdownNode): Outline {
  const items = (node.children ?? []).map((item) => ({ k: item.checked ?? null, c: markdownBlocks(item.children ?? []) }));
  return node.ordered ? { t: "ol", s: node.start ?? 1, items } : { t: "ul", items };
}

function markdownTable(node: MarkdownNode): Outline {
  return { t: "table", rows: (node.children ?? []).map((row) => (row.children ?? []).map((cell) => squash(markdownText(cell)))) };
}

const markdownOutlines: Readonly<Record<string, (node: MarkdownNode) => Outline>> = {
  paragraph: (node) => (onlyImages(node) ? { t: "media" } : { t: "p", x: squash(markdownText(node)) }),
  heading: (node) => ({ t: `h${String(node.depth ?? 1)}`, x: squash(markdownText(node)) }),
  code: (node) => ({ t: "code", x: node.value ?? "" }),
  blockquote: (node) => ({ t: "q", c: markdownBlocks(node.children ?? []) }),
  list: markdownList,
  table: markdownTable,
  thematicBreak: () => ({ t: "hr" }),
};

const notBlocks: ReadonlySet<string> = new Set(["definition", "footnoteDefinition"]);

function markdownBlocks(nodes: readonly MarkdownNode[]): Outline[] {
  return joinLists(nodes.flatMap((node) => {
    if (notBlocks.has(node.type)) return [];
    const outline = markdownOutlines[node.type];
    return [outline ? outline(node) : { t: node.type }];
  }));
}

function editorText(node: JSONContent): string {
  if (node.type === "hardBreak") return " ";
  return node.text ?? (node.content ?? []).map((child) => editorText(child)).join("");
}

function editorItems(node: JSONContent): ItemOutline[] {
  return (node.content ?? []).map((item) => ({ k: item.type === "taskItem" ? item.attrs?.checked === true : null, c: editorBlocks(item.content ?? []) }));
}

function editorTable(node: JSONContent): Outline {
  return { t: "table", rows: (node.content ?? []).map((row) => (row.content ?? []).map((cell) => squash(editorText(cell)))) };
}

function startOf(node: JSONContent): number {
  return typeof node.attrs?.start === "number" ? node.attrs.start : 1;
}

const editorOutlines: Readonly<Record<string, (node: JSONContent) => Outline>> = {
  paragraph: (node) => ({ t: "p", x: squash(editorText(node)) }),
  heading: (node) => ({ t: `h${String(node.attrs?.level ?? 1)}`, x: squash(editorText(node)) }),
  codeBlock: (node) => ({ t: "code", x: editorText(node) }),
  blockquote: (node) => ({ t: "q", c: editorBlocks(node.content ?? []) }),
  bulletList: (node) => ({ t: "ul", items: editorItems(node) }),
  taskList: (node) => ({ t: "ul", items: editorItems(node) }),
  orderedList: (node) => ({ t: "ol", s: startOf(node), items: editorItems(node) }),
  table: editorTable,
  horizontalRule: () => ({ t: "hr" }),
  media: () => ({ t: "media" }),
};

/** An empty paragraph: what the editor holds in an empty list item, where the markdown tree holds nothing. */
function isEmptyParagraph(node: JSONContent): boolean {
  return node.type === "paragraph" && !squash(editorText(node));
}

function editorBlocks(nodes: readonly JSONContent[]): Outline[] {
  return joinLists(nodes.flatMap((node) => {
    if (isEmptyParagraph(node)) return [];
    const outline = editorOutlines[node.type ?? ""];
    return [outline ? outline(node) : { t: node.type ?? "" }];
  }));
}

/*
 * List shapes that marked and remark read differently, found so far. Only
 * blocks with one of them pay for the read view's parse when they load.
 */
const emptyItem = /^[ \t>]*(?:[-+*]|\d{1,9}[.)])[ \t]*$/m;
const numberedTask = /^[ \t>]*\d{1,9}[.)][ \t]+\[[ xX]\]/m;
const codeAfterMarker = /^[ \t>]*(?:[-+*]|\d{1,9}[.)]) {5,}\S/m;
const tabIndent = /^[ >]*\t/m;
const taskItem = /^[ \t>]*[-+*][ \t]+\[[ xX]\](?:[ \t]|$)/m;
const plainItem = /^[ \t>]*(?:[-+*]|\d{1,9}[.)])[ \t]+(?!\[[ xX]\](?:[ \t]|$))\S/m;
const numberedLine = /^( *)(\d{1,9})[.)][ \t]/;

const markerLine = /^( *)(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;

/**
 * A numbered item other than 1 on the line after text: CommonMark lets only
 * 1 start a list inside a paragraph, so the read view may read the line as
 * text. A list item right above at the same indent is its sibling, and fine.
 */
function numberUnderText(markdown: string): boolean {
  const lines = markdown.split("\n");
  return lines.some((line, index) => {
    const match = numberedLine.exec(line);
    const before = lines[index - 1];
    if (!match || match[2] === "1" || before === undefined || before.trim() === "") return false;
    return markerLine.exec(before)?.[1]?.length !== match[1]?.length;
  });
}

/** True when the block has a list shape the two readers may read differently, so the read view's reading is checked. */
export function mayReadDifferently(markdown: string): boolean {
  if ([emptyItem, numberedTask, codeAfterMarker, tabIndent].some((pattern) => pattern.test(markdown))) return true;
  return (taskItem.test(markdown) && plainItem.test(markdown)) || numberUnderText(markdown);
}

/**
 * True when the read view (remark with GFM) reads `markdown` as the same
 * blocks, list numbers, task boxes, and text as the editor's `nodes`.
 */
export function readsTheSame(markdown: string, nodes: readonly JSONContent[]): boolean {
  const tree = reader.parse(markdown) as MarkdownNode;
  return JSON.stringify(markdownBlocks(tree.children ?? [])) === JSON.stringify(editorBlocks(nodes));
}
