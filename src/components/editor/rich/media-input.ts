import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { emptyMediaAttrs, MEDIA_NODE } from "./media-markdown";
import { defaultMediaLabel, insertableFiles, pasteIsFiles, uploadMediaKind } from "./media-upload-rules";
import { forgetUpload, queueUpload } from "./media-uploads";

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

function uploadIdsIn(content: Fragment, into: Set<string>) {
  content.descendants((node) => {
    const uploadId: unknown = node.attrs.uploadId;
    if (node.type.name === MEDIA_NODE && typeof uploadId === "string" && uploadId) into.add(uploadId);
  });
}

/** The upload ids of media blocks a change put into the document (inserted, pasted, or given a new upload). */
export function uploadIdsAdded(tr: Transaction): string[] {
  const ids = new Set<string>();
  for (const step of tr.steps) {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) uploadIdsIn(step.slice.content, ids);
  }
  return [...ids];
}

const uploadCleanupKey = new PluginKey<Set<string>>("mediaUploadCleanup");

/**
 * Remembers every upload a media block in this editor waited for, and
 * forgets them all (the picked File and its preview URL) when the editor
 * closes. A block removed with the keyboard leaves its upload behind until
 * then, so Undo still brings back a block that uploads; without this, each
 * such upload stayed in memory for the life of the tab.
 */
export function uploadCleanupPlugin(): Plugin<Set<string>> {
  return new Plugin<Set<string>>({
    key: uploadCleanupKey,
    state: {
      init: (_config, state) => {
        const ids = new Set<string>();
        uploadIdsIn(state.doc.content, ids);
        return ids;
      },
      apply: (tr, ids) => {
        if (!tr.docChanged) return ids;
        for (const uploadId of uploadIdsAdded(tr)) ids.add(uploadId);
        return ids;
      },
    },
    view: (view) => ({
      destroy: () => {
        for (const uploadId of uploadCleanupKey.getState(view.state) ?? []) forgetUpload(uploadId);
      },
    }),
  });
}

/**
 * Pasting or dropping files into a document makes a media block for each:
 * images, video, audio, PDFs, and other files the store takes. Each block
 * uploads its file and shows progress (media-view.tsx). Text pastes, drags
 * inside the editor, and anything in a code block are left alone. Uploads
 * are forgotten when the editor closes (uploadCleanupPlugin).
 */
export const MediaInput = Extension.create({
  name: "mediaInput",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      uploadCleanupPlugin(),
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

/**
 * For editors that can't hold media, such as a ui artifact's Markdown
 * block: file pastes and drops are consumed, so nothing uploads and no file
 * name or image lands as text, and `onRefuse` says why. Text pastes and
 * drags inside the editor are left alone.
 */
export const MediaRefusal = Extension.create<{ onRefuse: () => void }>({
  name: "mediaRefusal",

  addOptions() {
    return { onRefuse: () => undefined };
  },

  addProseMirrorPlugins() {
    const { onRefuse } = this.options;
    return [
      new Plugin({
        key: new PluginKey("mediaRefusal"),
        props: {
          handlePaste: (_view, event) => {
            if (pastedFiles(event).length === 0) return false;
            event.preventDefault();
            onRefuse();
            return true;
          },
          handleDrop: (_view, event, _slice, moved) => {
            if (moved || (event.dataTransfer?.files.length ?? 0) === 0) return false;
            event.preventDefault();
            onRefuse();
            return true;
          },
        },
      }),
    ];
  },
});
