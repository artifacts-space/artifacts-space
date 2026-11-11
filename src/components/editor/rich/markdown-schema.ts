import type { AnyExtension, JSONContent, NodeViewRenderer } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { renderTableToMarkdown, Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

import { isSafeHref } from "@/lib/link-policy";
import { fenceInfoOfLine, fenceLanguage } from "@/lib/markdown/fence-info";

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

/** Node views the editor adds; the round-trip runs without them. */
export interface SchemaViews {
  codeBlock?: NodeViewRenderer;
  rawMarkdown?: NodeViewRenderer;
  media?: NodeViewRenderer;
}

/**
 * The document model shared by the editor and the Markdown round-trip: the
 * GitHub-flavored Markdown that artifacts use, media blocks for uploaded
 * files (markdown-dialect.md), and nothing that Markdown cannot store
 * (underline is off). The editor swaps in node views for code blocks, media,
 * and raw blocks; names and Markdown rules stay the same.
 */
export function markdownSchemaExtensions(views: SchemaViews = {}): AnyExtension[] {
  const { codeBlock, rawMarkdown, media } = views;
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
    media ? MediaNode.extend({ addNodeView: () => media }) : MediaNode,
    rawMarkdown ? RawMarkdown.extend({ addNodeView: () => rawMarkdown }) : RawMarkdown,
  ];
}
