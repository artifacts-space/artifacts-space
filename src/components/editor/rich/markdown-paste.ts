import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { parseMarkdownFragment } from "./markdown-roundtrip";
import { isAllowedEditorUri } from "./markdown-schema";

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

function isSafeLinkMark(mark: { type: string; attrs?: Record<string, unknown> }): boolean {
  if (mark.type !== "link") return true;
  const href = mark.attrs?.href;
  return typeof href === "string" && isAllowedEditorUri(href);
}

/**
 * Pasted nodes with every link whose address the link policy refuses
 * (`javascript:` and the like) turned back into its words, as the link menu
 * refuses them.
 */
export function withoutUnsafeLinks(nodes: readonly JSONContent[]): JSONContent[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.marks ? { marks: node.marks.filter(isSafeLinkMark) } : {}),
    ...(node.content ? { content: withoutUnsafeLinks(node.content) } : {}),
  }));
}

/** Pasting Markdown text inserts formatted blocks, outside code blocks. Unsafe links paste as their words. */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (_view, event) => {
            if (editor.isActive("codeBlock")) return false;
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (!shouldPasteAsMarkdown(text, html)) return false;
            const nodes = withoutUnsafeLinks(parseMarkdownFragment(text));
            if (nodes.length === 0) return false;
            return editor.commands.insertContent(nodes);
          },
        },
      }),
    ];
  },
});
