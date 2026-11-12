import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { artifactShowsLink } from "@/lib/markdown/link-href";

import { parseMarkdownFragment } from "./markdown-roundtrip";

/** Line starts and inline syntax that mark text as Markdown. */
const markdownSignals: readonly RegExp[] = [
  /^#{1,6}\s/m,
  /^\s*[-*+]\s+\S/m,
  /^\s*\d+[.)]\s+\S/m,
  /^\s*[-*+]\s+\[[ xX]\]\s/m,
  /^>\s?/m,
  /^(`{3,}|~{3,})/m,
  /^\s*\|.*\|\s*$/m,
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /\*\*[^*\n]+\*\*/,
  /\[[^\]\n]+\]\([^)\s]+\)/,
  /`[^`\n]+`/,
];

/** True when pasted plain text looks like Markdown worth formatting. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  return markdownSignals.some((signal) => signal.test(text));
}

/**
 * True when a paste should be read as Markdown: plain text with Markdown
 * syntax, unless it came from this editor (ProseMirror marks its own copies)
 * or from a page that sent formatted HTML without Markdown in its text.
 */
export function shouldPasteAsMarkdown(text: string, html: string): boolean {
  if (html.includes("data-pm-slice")) return false;
  return looksLikeMarkdown(text);
}

/** Which pasted links stay links: the ones the Markdown's renderer would show as links. */
export type PastedLinkRule = (href: string) => boolean;

function keepsMark(mark: { type: string; attrs?: Record<string, unknown> }, keepsLink: PastedLinkRule): boolean {
  if (mark.type !== "link") return true;
  const href = mark.attrs?.href;
  return typeof href === "string" && keepsLink(href);
}

/**
 * Pasted nodes with every link the renderer would refuse (`javascript:`,
 * `data:`, and the like) turned back into its words. What the renderer
 * links (`keepsLink`) stays a link: for an artifact, uploads on this site
 * too (artifactShowsLink).
 */
export function withoutRefusedLinks(nodes: readonly JSONContent[], keepsLink: PastedLinkRule): JSONContent[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.marks ? { marks: node.marks.filter((mark) => keepsMark(mark, keepsLink)) } : {}),
    ...(node.content ? { content: withoutRefusedLinks(node.content, keepsLink) } : {}),
  }));
}

/**
 * Pasting Markdown text inserts formatted blocks, outside code blocks. A
 * link the renderer would refuse pastes as its words; `keepsLink` says which
 * it shows (artifactShowsLink by default; commentShowsLink in comments).
 */
export const MarkdownPaste = Extension.create<{ keepsLink: PastedLinkRule }>({
  name: "markdownPaste",

  addOptions() {
    return { keepsLink: artifactShowsLink };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const { keepsLink } = this.options;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (_view, event) => {
            if (editor.isActive("codeBlock")) return false;
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (!shouldPasteAsMarkdown(text, html)) return false;
            const nodes = withoutRefusedLinks(parseMarkdownFragment(text), keepsLink);
            if (nodes.length === 0) return false;
            return editor.commands.insertContent(nodes);
          },
        },
      }),
    ];
  },
});
