import type { AnyExtension, JSONContent, NodeViewRenderer } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { renderTableToMarkdown, Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

import { isSafeHref } from "@/lib/link-policy";

import { RawMarkdown } from "./raw-markdown-node";

/** The longest run of backticks at the start of a line in `text`. */
function longestFenceRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/^ {0,3}(`{3,})/gm)) {
    longest = Math.max(longest, match[1]?.length ?? 0);
  }
  return longest;
}

/**
 * The fence for a code block: three backticks, or one more than the longest
 * fence inside it, so code that shows Markdown fences stays one block.
 */
export function codeFence(text: string): string {
  return "`".repeat(Math.max(3, longestFenceRun(text) + 1));
}

function textOf(content: JSONContent[] | undefined): string {
  return (content ?? []).map((child) => child.text ?? "").join("");
}

/** Renders a code block with a fence long enough for the code inside it. */
export function renderCodeBlockMarkdown(node: JSONContent): string {
  const language: unknown = node.attrs?.language;
  const code = textOf(node.content);
  const fence = codeFence(code);
  return `${fence}${typeof language === "string" ? language : ""}\n${code}\n${fence}`;
}

/** Links follow the same policy as every artifact link: http, https, and mailto only. */
export function isAllowedEditorUri(url: string): boolean {
  return isSafeHref(url);
}

/** Code blocks keep their language and write fences that fit their content. */
export const MarkdownCodeBlock = CodeBlock.extend({
  renderMarkdown: (node) => renderCodeBlockMarkdown(node),
}).configure({ defaultLanguage: null, enableTabIndentation: true });

/**
 * Tables without the blank lines Tiptap puts around them, so a table inside
 * a quote or list does not leave empty quoted lines behind.
 */
export const MarkdownTable = Table.extend({
  renderMarkdown: (node, helpers) => renderTableToMarkdown(node, helpers).replace(/^\n+|\n+$/g, ""),
}).configure({ resizable: false });

/** Node views the editor adds; the round-trip runs without them. */
export interface SchemaViews {
  codeBlock?: NodeViewRenderer;
  rawMarkdown?: NodeViewRenderer;
}

/**
 * The document model shared by the editor and the Markdown round-trip: the
 * GitHub-flavored Markdown that artifacts use, and nothing that Markdown
 * cannot store (underline is off). The editor swaps in node views for code
 * blocks and raw blocks; names and Markdown rules stay the same.
 */
export function markdownSchemaExtensions(views: SchemaViews = {}): AnyExtension[] {
  const { codeBlock, rawMarkdown } = views;
  return [
    StarterKit.configure({
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
    }),
    codeBlock ? MarkdownCodeBlock.extend({ addNodeView: () => codeBlock }) : MarkdownCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownTable,
    TableRow,
    TableHeader,
    TableCell,
    rawMarkdown ? RawMarkdown.extend({ addNodeView: () => rawMarkdown }) : RawMarkdown,
  ];
}
