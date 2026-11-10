import { Extension, type AnyExtension, type Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockView } from "./code-block-view";
import { MarkdownPaste } from "./markdown-paste";
import { markdownSchemaExtensions } from "./markdown-schema";
import { MediaInput, MediaRefusal } from "./media-input";
import { MediaOffView } from "./media-off-view";
import { MediaView } from "./media-view";
import { RawBlockView } from "./raw-block-view";
import { slashCommandsFor } from "./slash-commands";
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

export interface RichEditorOptions {
  onLinkShortcut: (editor: Editor) => boolean;
  /**
   * False for editors whose saves don't attach files, such as a ui
   * artifact's Markdown block: no media slash commands, file paste and drop
   * refused through `onMediaRefused`, and media already in the Markdown kept
   * as written with a note. Default true.
   */
  media?: boolean | undefined;
  onMediaRefused?: () => void;
}

/**
 * Everything the rich editor runs: the shared Markdown schema with node views
 * for code, media, and raw blocks, the placeholder, the slash menu, file
 * paste and drop (before Markdown paste, so a pasted screenshot uploads),
 * Markdown paste, and ⌘K or Ctrl+K for links.
 */
export function richEditorExtensions(options: RichEditorOptions): AnyExtension[] {
  const media = options.media ?? true;
  return [
    ...markdownSchemaExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      rawMarkdown: ReactNodeViewRenderer(RawBlockView),
      media: ReactNodeViewRenderer(media ? MediaView : MediaOffView),
    }),
    Placeholder.configure({ placeholder: placeholderFor, showOnlyCurrent: true, includeChildren: false }),
    SlashCommandExtension.configure({ commands: slashCommandsFor(media) }),
    media ? MediaInput : MediaRefusal.configure({ onRefuse: options.onMediaRefused ?? (() => undefined) }),
    MarkdownPaste,
    Extension.create({
      name: "linkShortcut",
      addKeyboardShortcuts() {
        return { "Mod-k": () => options.onLinkShortcut(this.editor) };
      },
    }),
  ];
}
