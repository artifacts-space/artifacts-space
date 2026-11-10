import { Extension, type AnyExtension, type Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockView } from "./code-block-view";
import { MarkdownPaste } from "./markdown-paste";
import { markdownSchemaExtensions } from "./markdown-schema";
import { MediaInput } from "./media-input";
import { MediaView } from "./media-view";
import { RawBlockView } from "./raw-block-view";
import { SlashCommandExtension } from "./slash-menu";

interface PlaceholderContext {
  editor: { isEmpty: boolean };
  node: { type: { name: string }; attrs: Record<string, unknown> };
}

/** The hint shown in an empty document, an empty line, or an empty heading. */
export function placeholderFor({ editor, node }: PlaceholderContext): string {
  if (editor.isEmpty) return "Start writing, or type / for blocks";
  if (node.type.name === "heading") return "Heading";
  if (node.type.name === "paragraph") return "Type / for blocks";
  return "";
}

/**
 * Everything the rich editor runs: the shared Markdown schema with node views
 * for code, media, and raw blocks, the placeholder, the slash menu, file
 * paste and drop (before Markdown paste, so a pasted screenshot uploads),
 * Markdown paste, and ⌘K or Ctrl+K for links.
 */
export function richEditorExtensions(options: { onLinkShortcut: (editor: Editor) => boolean }): AnyExtension[] {
  return [
    ...markdownSchemaExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      rawMarkdown: ReactNodeViewRenderer(RawBlockView),
      media: ReactNodeViewRenderer(MediaView),
    }),
    Placeholder.configure({ placeholder: placeholderFor, showOnlyCurrent: true, includeChildren: false }),
    SlashCommandExtension,
    MediaInput,
    MarkdownPaste,
    Extension.create({
      name: "linkShortcut",
      addKeyboardShortcuts() {
        return { "Mod-k": () => options.onLinkShortcut(this.editor) };
      },
    }),
  ];
}
