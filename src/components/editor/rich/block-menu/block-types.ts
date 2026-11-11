import { IconBlockquote, IconCode, IconH1, IconH2, IconH3, IconLetterT, IconList, IconListCheck, IconListNumbers, type Icon } from "@tabler/icons-react";
import type { ChainedCommands } from "@tiptap/core";

/*
 * The block types "Change" offers, in menu order. Each entry says how to
 * recognise a block of that type and how to turn a block into it, so a new
 * type joins the menu (and its search) by adding one entry here once the
 * editor supports it: Heading 4, toggle lists, callouts, equations, toggle
 * headings, and columns come with later phases.
 */

/** What a block is, as Change sees it: its node, a heading's level, and the list a list item is in. */
export interface BlockShape {
  node: string;
  level?: number | undefined;
  list?: string | undefined;
}

/** One type a block can change to. */
export interface BlockTypeOption {
  id: string;
  label: string;
  /** Extra words search matches, such as "h1" or "todo". */
  keywords: readonly string[];
  icon: Icon;
  /** True for a list type: a list item changes its list rather than leaving it. */
  list: boolean;
  /** True when a block of this shape is already this type. */
  matches: (shape: BlockShape) => boolean;
  /** Turns the selected lines, already plain paragraphs, into this type. */
  apply: (chain: ChainedCommands) => ChainedCommands;
}

/** A heading of one level. */
function heading(level: 1 | 2 | 3, icon: Icon): BlockTypeOption {
  return {
    id: `h${String(level)}`,
    label: `Heading ${String(level)}`,
    keywords: [`h${String(level)}`, "title"],
    icon,
    list: false,
    matches: (shape) => shape.node === "heading" && shape.level === level,
    apply: (chain) => chain.setNode("heading", { level }),
  };
}

/** Every type Change offers today, in menu order. */
export const blockTypes: readonly BlockTypeOption[] = [
  { id: "text", label: "Text", keywords: ["paragraph", "plain"], icon: IconLetterT, list: false, matches: (shape) => shape.node === "paragraph" && !shape.list, apply: (chain) => chain },
  heading(1, IconH1),
  heading(2, IconH2),
  heading(3, IconH3),
  { id: "bullet", label: "Bulleted list", keywords: ["ul", "unordered", "bullet"], icon: IconList, list: true, matches: (shape) => shape.list === "bulletList", apply: (chain) => chain.toggleBulletList() },
  { id: "ordered", label: "Numbered list", keywords: ["ol", "ordered", "number"], icon: IconListNumbers, list: true, matches: (shape) => shape.list === "orderedList", apply: (chain) => chain.toggleOrderedList() },
  { id: "task", label: "Task list", keywords: ["todo", "to-do", "checkbox"], icon: IconListCheck, list: true, matches: (shape) => shape.list === "taskList", apply: (chain) => chain.toggleTaskList() },
  { id: "code", label: "Code block", keywords: ["code", "pre", "snippet"], icon: IconCode, list: false, matches: (shape) => shape.node === "codeBlock", apply: (chain) => chain.setCodeBlock() },
  { id: "quote", label: "Quote", keywords: ["blockquote", "citation"], icon: IconBlockquote, list: false, matches: (shape) => shape.node === "blockquote", apply: (chain) => chain.setBlockquote() },
];

/** The type a block is now, or null for blocks Change cannot change (tables, dividers, media, raw Markdown). */
export function currentBlockType(shape: BlockShape): BlockTypeOption | null {
  return blockTypes.find((option) => option.matches(shape)) ?? null;
}

/** Names for blocks that are not on the Change list, for the menu's heading. */
const otherNames: Readonly<Record<string, string>> = {
  table: "Table",
  horizontalRule: "Divider",
  rawMarkdown: "Markdown",
};

const mediaNames: Readonly<Record<string, string>> = { image: "Image", video: "Video", audio: "Audio", pdf: "PDF", file: "File" };

/** What the menu calls a block: its Change type, or "Table", "Image", and so on. */
export function blockTypeName(shape: BlockShape, mediaKind?: string): string {
  const current = currentBlockType(shape);
  if (current) return current.label;
  if (shape.node === "media") return mediaNames[mediaKind ?? ""] ?? "File";
  return otherNames[shape.node] ?? "Block";
}
