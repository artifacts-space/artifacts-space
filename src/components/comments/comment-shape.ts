import type { JSONContent } from "@tiptap/core";

/*
 * What a comment shows, as one comparable string: its blocks, their marks,
 * and their text. Built from the box's content (what the person saw) and
 * from the Markdown tree the thread renders (what readers will see), so the
 * box can check the Markdown it writes reads back the same.
 *
 * Differences nobody sees are left out: spaces at the start and end of a
 * line, empty lines at the start and end of a paragraph, block colors, and
 * whether a bare address is a link (the thread links every bare URL; the
 * box links one only once a space follows it). Anything the box cannot show
 * (raw HTML, an image, a footnote) is kept as a marker, so it never matches.
 */

/** The few Markdown-tree fields the shape reads. */
export interface TreeNode {
  type: string;
  value?: string | null;
  url?: string | null;
  depth?: number | null;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  children?: TreeNode[];
}

interface Run {
  text: string;
  marks: string;
}

const BREAK = null;
type Inline = Run | typeof BREAK;

/** True when a link is a bare address: its words are its address, as the thread's autolinks are. */
function isBareAddress(text: string, href: string): boolean {
  return [text, `http://${text}`, `https://${text}`, `mailto:${text}`].includes(href);
}

function linkMark(text: string, href: string): string[] {
  return isBareAddress(text, href) ? [] : [`link:${href}`];
}

function markKey(marks: readonly string[]): string {
  return [...marks].sort().join(",");
}

/** Joins runs with the same marks, so how text is split into nodes does not count. */
function joinRuns(runs: readonly Run[]): Run[] {
  const joined: Run[] = [];
  for (const run of runs) {
    const last = joined.at(-1);
    if (last?.marks === run.marks) last.text += run.text;
    else if (run.text) joined.push({ ...run });
  }
  return joined;
}

/** One line's runs, without the spaces at its ends, which no reader sees. */
function trimLine(runs: readonly Run[]): Run[] {
  const line = joinRuns(runs.map((run) => ({ ...run, text: run.text.replace(/[ \t]*\n[ \t]*/g, "\n") })));
  const first = line[0];
  if (first) first.text = first.text.trimStart();
  const last = line.at(-1);
  if (last) last.text = last.text.trimEnd();
  return line.filter((run) => run.text);
}

/** A paragraph's or heading's text, line by line, as a string. */
function inlineShape(items: readonly Inline[]): string {
  const lines: Run[][] = [[]];
  for (const item of items) {
    if (item === BREAK) lines.push([]);
    else lines.at(-1)?.push(item);
  }
  const trimmed = lines.map(trimLine);
  while (trimmed.length > 0 && trimmed[0]?.length === 0) trimmed.shift();
  while (trimmed.length > 0 && trimmed.at(-1)?.length === 0) trimmed.pop();
  return JSON.stringify(trimmed.map((line) => line.map((run) => [run.text, run.marks])));
}

/* The box's side. */

function boxRun(child: JSONContent): Inline {
  if (child.type === "hardBreak") return BREAK;
  if (child.type !== "text") return { text: `?${child.type ?? ""}`, marks: "?" };
  const text = child.text ?? "";
  const marks = (child.marks ?? []).flatMap((mark) => (mark.type === "link" ? linkMark(text, String(mark.attrs?.href ?? "")) : [mark.type]));
  return { text, marks: markKey(marks) };
}

function boxInline(node: JSONContent): string {
  return inlineShape((node.content ?? []).map(boxRun));
}

function boxText(node: JSONContent): string {
  return (node.content ?? []).map((child) => child.text ?? "").join("");
}

function boxChildren(node: JSONContent): string {
  return `[${(node.content ?? []).map(boxBlock).filter(Boolean).join(",")}]`;
}

/** A table cell's paragraphs, as the one line of text the thread shows. */
function boxCell(node: JSONContent): string {
  return `cell${inlineShape((node.content ?? []).flatMap((paragraph) => (paragraph.content ?? []).map(boxRun)))}`;
}

const boxBlocks: Readonly<Record<string, (node: JSONContent) => string>> = {
  paragraph: (node) => ((node.content ?? []).length > 0 ? `p${boxInline(node)}` : ""),
  heading: (node) => `h${String(node.attrs?.level ?? 1)}${boxInline(node)}`,
  blockquote: (node) => `quote${boxChildren(node)}`,
  bulletList: (node) => `ul${boxChildren(node)}`,
  taskList: (node) => `ul${boxChildren(node)}`,
  orderedList: (node) => `ol${String(node.attrs?.start ?? 1)}${boxChildren(node)}`,
  listItem: (node) => `li${boxChildren(node)}`,
  taskItem: (node) => `li${node.attrs?.checked === true ? "x" : "o"}${boxChildren(node)}`,
  codeBlock: (node) => `code:${String(node.attrs?.language ?? "")}${JSON.stringify(boxText(node))}`,
  horizontalRule: () => "hr",
  table: (node) => `table${boxChildren(node)}`,
  tableRow: (node) => `tr${boxChildren(node)}`,
  tableHeader: boxCell,
  tableCell: boxCell,
};

function boxBlock(node: JSONContent): string {
  const shape = boxBlocks[node.type ?? ""];
  return shape ? shape(node) : `?${node.type ?? ""}`;
}

/** What the box shows for `nodes`, its top-level blocks. */
export function boxShape(nodes: readonly JSONContent[]): string {
  return nodes.map(boxBlock).filter(Boolean).join(",");
}

/* The thread's side. */

const treeMarks: Readonly<Record<string, string>> = { strong: "bold", emphasis: "italic", delete: "strike" };

function treeText(node: TreeNode): string {
  return node.value ?? (node.children ?? []).map(treeText).join("");
}

/** Text-holding leaves: their text and the mark they add. */
const treeLeaves: Readonly<Record<string, readonly string[]>> = { text: [], inlineCode: ["code"] };

function treeRun(node: TreeNode, marks: readonly string[]): Inline[] {
  const leaf = treeLeaves[node.type];
  if (leaf) return [{ text: node.value ?? "", marks: markKey([...marks, ...leaf]) }];
  if (node.type === "break") return [BREAK];
  const mark = treeMarks[node.type];
  if (mark) return treeRuns(node.children ?? [], [...marks, mark]);
  if (node.type === "link") return treeRuns(node.children ?? [], [...marks, ...linkMark(treeText(node), node.url ?? "")]);
  return [{ text: `?${node.type}`, marks: "?" }];
}

function treeRuns(nodes: readonly TreeNode[], marks: readonly string[]): Inline[] {
  return nodes.flatMap((node) => treeRun(node, marks));
}

function treeInline(node: TreeNode): string {
  return inlineShape(treeRuns(node.children ?? [], []));
}

function treeChildren(node: TreeNode): string {
  return `[${(node.children ?? []).map(treeBlock).filter(Boolean).join(",")}]`;
}

function treeListItem(node: TreeNode): string {
  const box = node.checked === true ? "x" : node.checked === false ? "o" : "";
  return `li${box}${treeChildren(node)}`;
}

const treeBlocks: Readonly<Record<string, (node: TreeNode) => string>> = {
  paragraph: (node) => ((node.children ?? []).length > 0 ? `p${treeInline(node)}` : ""),
  heading: (node) => `h${String(node.depth ?? 1)}${treeInline(node)}`,
  blockquote: (node) => `quote${treeChildren(node)}`,
  list: (node) => (node.ordered ? `ol${String(node.start ?? 1)}` : "ul") + treeChildren(node),
  listItem: treeListItem,
  code: (node) => `code:${node.lang ?? ""}${JSON.stringify(node.value ?? "")}`,
  thematicBreak: () => "hr",
  table: (node) => `table${treeChildren(node)}`,
  tableRow: (node) => `tr${treeChildren(node)}`,
  tableCell: (node) => `cell${treeInline(node)}`,
  // A link definition shows nothing itself; the links that use it show.
  definition: () => "",
};

function treeBlock(node: TreeNode): string {
  const shape = treeBlocks[node.type];
  return shape ? shape(node) : `?${node.type}`;
}

/** What the thread shows for a Markdown tree's top-level blocks. */
export function treeShape(nodes: readonly TreeNode[]): string {
  return nodes.map(treeBlock).filter(Boolean).join(",");
}
