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
  /**
   * A short box such as a comment: this hint in the empty box and none on
   * other empty lines, and no slash menu, so a "/" in a path or "and/or"
   * stays text. Unset for a document.
   */
  boxPlaceholder?: string | undefined;
}

/** The placeholder rule: a document's hints, or a box's single hint. */
function placeholderRule(boxPlaceholder: string | undefined): (context: PlaceholderContext) => string {
  if (boxPlaceholder === undefined) return placeholderFor;
  return ({ editor }) => (editor.isEmpty ? boxPlaceholder : "");
}

/**
 * Everything the rich editor runs: the shared Markdown schema with node views
 * for code, media, and raw blocks, the placeholder, the slash menu (not in a
 * box such as a comment), file
 * paste and drop (before Markdown paste, so a pasted screenshot uploads),
 * Markdown paste, and ⌘K or Ctrl+K for links.
 */
export function richEditorExtensions(options: RichEditorOptions): AnyExtension[] {
  const media = options.media ?? true;
  const box = options.boxPlaceholder !== undefined;
  return [
    ...markdownSchemaExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      rawMarkdown: ReactNodeViewRenderer(RawBlockView),
      media: ReactNodeViewRenderer(media ? MediaView : MediaOffView),
    }),
    Placeholder.configure({ placeholder: placeholderRule(options.boxPlaceholder), showOnlyCurrent: true, includeChildren: false }),
    ...(box ? [] : [SlashCommandExtension.configure({ commands: slashCommandsFor(media) })]),
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
