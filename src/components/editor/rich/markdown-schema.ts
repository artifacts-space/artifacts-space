import type { AnyExtension, JSONContent, NodeViewRenderer } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { BulletList, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { renderTableToMarkdown, Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

import { isSafeHref } from "@/lib/link-policy";
import { fenceInfoOfLine, fenceLanguage } from "@/lib/markdown/fence-info";

import { BlockColorComment, withColorableText } from "./block-color-nodes";
import { MediaNode } from "./media-node";
import { RawMarkdown } from "./raw-markdown-node";

const fenceRuns = { "`": /^ {0,3}(`{3,})/gm, "~": /^ {0,3}(~{3,})/gm } as const;

/** The longest run of `char` fences at the start of a line in `text`. */
function longestFenceRun(text: string, char: keyof typeof fenceRuns): number {
  let longest = 0;
  for (const match of text.matchAll(fenceRuns[char])) {
    longest = Math.max(longest, match[1]?.length ?? 0);
  }
  return longest;
}

/**
 * The fence for a code block: three backticks, or one more than the longest
 * fence inside it, so code that shows Markdown fences stays one block. An
 * info string with a backtick (a caption can hold one) cannot follow a
 * backtick fence, so it gets tildes instead.
 */
export function codeFence(text: string, info = ""): string {
  const char = info.includes("`") ? "~" : "`";
  return char.repeat(Math.max(3, longestFenceRun(text, char) + 1));
}

function textOf(content: JSONContent[] | undefined): string {
  return (content ?? []).map((child) => child.text ?? "").join("");
}

/** Renders a code block with a fence long enough for the code inside it. */
export function renderCodeBlockMarkdown(node: JSONContent): string {
  const language: unknown = node.attrs?.language;
  const code = textOf(node.content);
  const info = typeof language === "string" ? language : "";
  const fence = codeFence(code, info);
  return `${fence}${info}\n${code}\n${fence}`;
}

/**
 * A code token's info string as written on its fence line. marked decodes
 * backslash escapes in `lang`, which would lose a caption's escaped quotes
 * (fence-info.ts), so the attribute keeps the line's own text.
 */
function tokenInfo(token: { raw?: string; lang?: string }): string | null {
  const firstLine = token.raw?.split("\n", 1)[0] ?? "";
  return fenceInfoOfLine(firstLine) ?? (token.lang ?? null);
}

/** The language from a pasted `<pre><code class="language-…">`, as Tiptap reads it. */
function languageFromClass(element: HTMLElement): string | null {
  const name = [...(element.firstElementChild?.classList ?? [])].find((className) => className.startsWith("language-"));
  return name ? name.slice("language-".length) : null;
}

/** Links follow the same policy as every artifact link: http, https, and mailto only. */
export function isAllowedEditorUri(url: string): boolean {
  return isSafeHref(url);
}

/**
 * Code blocks keep their whole info string (language and attributes, as
 * written) in `language`, and write fences that fit their content. Copy and
 * paste inside the editor keeps it through `data-info`.
 */
export const MarkdownCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-info") ?? languageFromClass(element),
        rendered: false,
      },
    };
  },
  renderHTML({ node }) {
    const info: unknown = node.attrs.language;
    const language = fenceLanguage(info);
    return ["pre", typeof info === "string" && info ? { "data-info": info } : {}, ["code", language ? { class: `language-${language}` } : {}, 0]];
  },
  parseMarkdown: (token, helpers) => {
    if (!/^(`{3}|~{3})/u.test(token.raw ?? "") && token.codeBlockStyle !== "indented") return [];
    return helpers.createNode("codeBlock", { language: tokenInfo(token) || null }, token.text ? [helpers.createTextNode(token.text)] : []);
  },
  renderMarkdown: (node) => renderCodeBlockMarkdown(node),
}).configure({ defaultLanguage: null, enableTabIndentation: true });

/**
 * Tables without the blank lines Tiptap puts around them, so a table inside
 * a quote or list does not leave empty quoted lines behind.
 */
export const MarkdownTable = Table.extend({
  renderMarkdown: (node, helpers) => renderTableToMarkdown(node, helpers).replace(/^\n+|\n+$/g, ""),
}).configure({ resizable: false });

/** A list rule that never matches, so marked's own list rule reads the list. */
function leftToMarked(name: string) {
  return { name, level: "block" as const, start: () => -1, tokenize: () => undefined };
}

/** The fields of a marked list item that the task rules read. */
interface ItemToken {
  type?: string;
  raw?: string;
  text?: string;
  task?: boolean;
  checked?: boolean;
  tokens?: ItemToken[];
}

/**
 * A list item with each line of text among its blocks as a paragraph. marked
 * marks them so only in a list it takes as loose, and Tiptap's item rule
 * reads a line of text after the item's first block as bare text, which the
 * schema rejects. So `- a` with a table and a paragraph under it loaded only
 * beside an item with a blank line in it. Read this way, an item reads the
 * same whatever the other items hold.
 */
function withParagraphs(item: ItemToken): ItemToken {
  return { ...item, tokens: (item.tokens ?? []).map((token) => (token.type === "text" ? { ...token, type: "paragraph" } : token)) };
}

const boxPrefix = /^\[[ xX]\] /;

/** A task item's token without marked's checkbox, which sits first in the item or first in its opening paragraph. */
function withoutBox(item: ItemToken): ItemToken {
  const tokens = (item.tokens ?? []).filter((token) => token.type !== "checkbox");
  const [first, ...rest] = tokens;
  if (!first?.tokens?.some((token) => token.type === "checkbox")) return { ...item, task: false, tokens };
  const opening = { ...first, raw: (first.raw ?? "").replace(boxPrefix, ""), text: (first.text ?? "").replace(boxPrefix, ""), tokens: first.tokens.filter((token) => token.type !== "checkbox") };
  return { ...item, task: false, tokens: [opening, ...rest] };
}

/** A task item's content: a paragraph first, as the schema asks, then its other blocks. */
function taskContent(content: JSONContent[] | undefined): JSONContent[] {
  const blocks = content ?? [];
  return blocks[0]?.type === "paragraph" ? blocks : [{ type: "paragraph" }, ...blocks];
}

/** One item of a bulleted or task list as its node, and the list type it belongs in. */
function unorderedItem(item: ItemToken, parse: (item: ItemToken) => JSONContent | undefined): { list: string; node: JSONContent } | null {
  const parsed = parse(withParagraphs(item.task === true ? withoutBox(item) : item));
  if (!parsed) return null;
  if (item.task !== true) return { list: "bulletList", node: parsed };
  return { list: "taskList", node: { type: "taskItem", attrs: { checked: item.checked === true }, content: taskContent(parsed.content) } };
}

/**
 * Bulleted and task lists read by marked's own list rule, as CommonMark
 * reads them and as the read view does. Tiptap's task list rule ended a list
 * at a blank line before the next item, so a loose task list loaded as one
 * list per item, and it read a second paragraph in a nested task item as
 * bare text, which the schema rejects. Here a list is one list however its
 * items are spaced. Task items and plain items in one Markdown list become a
 * task list and a bulleted list, in the order written. A box with nothing
 * after it (`- [ ]`) is an item with the text `[ ]`, as the page shows it.
 */
const MarkdownBulletList = BulletList.extend({
  parseMarkdown: (token, helpers) => {
    if (token.type !== "list" || token.ordered === true) return [];
    const lists: JSONContent[] = [];
    for (const item of (Array.isArray(token.items) ? token.items : []) as ItemToken[]) {
      const read = unorderedItem(item, (cleaned) => helpers.parseChildren([cleaned])[0]);
      if (!read) continue;
      const last = lists.at(-1);
      if (last?.type === read.list) last.content = [...(last.content ?? []), read.node];
      else lists.push({ type: read.list, content: [read.node] });
    }
    return lists;
  },
});

/**
 * Task lists come from `MarkdownBulletList`. Tiptap's own task list rule
 * never runs, and no rule answers to a `taskList` token: with one in place,
 * the Markdown manager splits a list of task and plain items by its own
 * rule, which takes only the first line of a task item's text.
 */
const MarkdownTaskList = TaskList.extend({
  markdownTokenizer: leftToMarked("taskList"),
  markdownTokenName: "list",
  parseMarkdown: () => [],
});

/**
 * Numbered lists read by marked's own list rule, as CommonMark reads them.
 * Tiptap's numbered list rule indents an item's blocks by two spaces, not
 * by the marker's width, so a code block under `1.` lost its first space
 * and the item stayed as written. A tokenizer that never matches leaves
 * every numbered list to marked; Tiptap still turns its tokens into nodes.
 */
const MarkdownOrderedList = OrderedList.extend({
  markdownTokenizer: leftToMarked("orderedList"),
  /*
   * marked's items go to the list item rule, as a bulleted list's do. Tiptap's
   * own rule for numbered items expects its tokenizer's items and takes the
   * text of marked's as written, so `1. **bold**` came out as literal stars
   * and the item stayed as written.
   */
  parseMarkdown: (token, helpers) => {
    if (token.type !== "list" || token.ordered !== true) return [];
    const start = typeof token.start === "number" ? token.start : 1;
    const items = (Array.isArray(token.items) ? token.items : []) as ItemToken[];
    return helpers.createNode("orderedList", start === 1 ? {} : { start }, helpers.parseChildren(items.map((item) => withParagraphs(item))));
  },
});

/** StarterKit with paragraphs and headings that keep block colors (block-color-nodes.ts). */
const ColorableStarterKit = StarterKit.extend({
  addExtensions() {
    return withColorableText(this.parent?.() ?? []);
  },
});

/** Node views the editor adds; the round-trip runs without them. */
export interface SchemaViews {
  codeBlock?: NodeViewRenderer;
  rawMarkdown?: NodeViewRenderer;
  media?: NodeViewRenderer;
}

/**
 * The document model shared by the editor and the Markdown round-trip: the
 * GitHub-flavored Markdown that artifacts use, media blocks for uploaded
 * files and block colors (markdown-dialect.md), and nothing that Markdown cannot store
 * (underline is off). The editor swaps in node views for code blocks, media,
 * and raw blocks; names and Markdown rules stay the same.
 */
export function markdownSchemaExtensions(views: SchemaViews = {}): AnyExtension[] {
  const { codeBlock, rawMarkdown, media } = views;
  return [
    ColorableStarterKit.configure({
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isAllowedEditorUri(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow ugc", target: null },
      },
      codeBlock: false,
      bulletList: false,
      orderedList: false,
    }),
    MarkdownBulletList,
    MarkdownOrderedList,
    codeBlock ? MarkdownCodeBlock.extend({ addNodeView: () => codeBlock }) : MarkdownCodeBlock,
    MarkdownTaskList,
    TaskItem.configure({ nested: true }),
    MarkdownTable,
    TableRow,
    TableHeader,
    TableCell,
    media ? MediaNode.extend({ addNodeView: () => media }) : MediaNode,
    rawMarkdown ? RawMarkdown.extend({ addNodeView: () => rawMarkdown }) : RawMarkdown,
    BlockColorComment,
  ];
}
