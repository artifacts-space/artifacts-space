import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { emptyMediaAttrs, MEDIA_NODE } from "./media-markdown";
import { defaultMediaLabel, insertableFiles, pasteIsFiles, uploadMediaKind } from "./media-upload-rules";
import { queueUpload } from "./media-uploads";

/** A media block that waits for `file` to upload. */
export function uploadingMediaNode(file: File): JSONContent {
  const kind = uploadMediaKind(file);
  return { type: MEDIA_NODE, attrs: { ...emptyMediaAttrs(kind), alt: defaultMediaLabel(kind, file.name), uploadId: queueUpload(file) } };
}

/** Keeps a line to type on after media that ends the document. */
function ensureTrailingParagraph(editor: Editor) {
  if (editor.state.doc.lastChild?.type.name !== MEDIA_NODE) return;
  editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
}

/** Inserts one uploading media block per file at `position`, or at the cursor. */
export function insertFiles(editor: Editor, files: readonly File[], position?: number): boolean {
  const nodes = insertableFiles(files).map(uploadingMediaNode);
  if (nodes.length === 0) return false;
  const inserted = position === undefined ? editor.chain().focus().insertContent(nodes).run() : editor.chain().focus().insertContentAt(position, nodes).run();
  if (inserted) ensureTrailingParagraph(editor);
  return inserted;
}

function pastedFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  const files = [...data.files];
  const paste = { fileNames: files.map((file) => file.name), text: data.getData("text/plain"), html: data.getData("text/html") };
  return pasteIsFiles(paste) ? files : [];
}

function dropPosition(view: EditorView, event: DragEvent): number | undefined {
  return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
}

/**
 * Pasting or dropping files into a document makes a media block for each:
 * images, video, audio, PDFs, and other files the store takes. Each block
 * uploads its file and shows progress (media-view.tsx). Text pastes, drags
 * inside the editor, and anything in a code block are left alone.
 */
export const MediaInput = Extension.create({
  name: "mediaInput",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("mediaInput"),
        props: {
          handlePaste: (_view, event) => {
            if (editor.isActive("codeBlock")) return false;
            const files = pastedFiles(event);
            if (files.length === 0) return false;
            event.preventDefault();
            return insertFiles(editor, files);
          },
          handleDrop: (view, event, _slice, moved) => {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (moved || files.length === 0) return false;
            event.preventDefault();
            return insertFiles(editor, files, dropPosition(view, event));
          },
        },
      }),
    ];
  },
});
