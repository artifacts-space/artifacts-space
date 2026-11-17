import { Extension, type CommandProps, type Editor, type JSONContent } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { AttrStep, ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { mediaKindForType } from "@/lib/files/media-rules";

import { addMediaEvent, dropZoneAttribute, readMediaRequest, showsMedia, takenByPage, takesFilesAttribute, type AttachedFile, type MediaRequest } from "./media-bridge";
import { caretLanding, endLanding, fileLanding, LandingMark, type Point } from "./media-landing";
import { emptyMediaAttrs, MEDIA_NODE } from "./media-markdown";
import { defaultMediaLabel, insertProblems, pasteIsFiles, uploadMediaKind } from "./media-upload-rules";
import { forgetUpload, queueUpload } from "./media-uploads";

/** A media block that waits for `file` to upload, or that says why it cannot (`refusal`). */
export function uploadingMediaNode(file: File, refusal: string | null = null): JSONContent {
  const kind = uploadMediaKind(file);
  return { type: MEDIA_NODE, attrs: { ...emptyMediaAttrs(kind), alt: defaultMediaLabel(kind, file.name), uploadId: queueUpload(file, refusal) } };
}

/** How many media blocks the document shows now. */
function mediaBlockCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => { if (node.type.name === MEDIA_NODE) count += 1; });
  return count;
}

/**
 * Keeps a line to type on after media that ends the document. A command
 * for the chain that inserted the media, so the block and its line are one
 * change: one Undo takes both away.
 */
function keepTrailingLine({ tr, state }: CommandProps): boolean {
  const line = state.schema.nodes.paragraph;
  if (line && tr.doc.lastChild?.type.name === MEDIA_NODE) tr.insert(tr.doc.content.size, line.create());
  return true;
}

/**
 * Inserts one media block per file at `position`, or at the cursor: every
 * file, in order, however many. A file that cannot go in (its size or type,
 * or a document that already shows as many files as it may) gets a block
 * too, which says why and offers Remove; no file goes with no word.
 */
export function insertFiles(editor: Editor, files: readonly File[], position?: number): boolean {
  const problems = insertProblems(files, mediaBlockCount(editor));
  const nodes = files.map((file, index) => uploadingMediaNode(file, problems[index]));
  if (nodes.length === 0) return false;
  const chain = editor.chain().focus();
  return (position === undefined ? chain.insertContent(nodes) : chain.insertContentAt(position, nodes)).command(keepTrailingLine).run();
}

function pastedFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  const files = [...data.files];
  const paste = { fileNames: files.map((file) => file.name), text: data.getData("text/plain"), html: data.getData("text/html") };
  return pasteIsFiles(paste) ? files : [];
}

/** A media block for a file the artifact already has: nothing uploads, the block points at it. */
function attachedMediaNode(file: AttachedFile): JSONContent {
  const kind = mediaKindForType(file.contentType);
  return { type: MEDIA_NODE, attrs: { ...emptyMediaAttrs(kind), src: `/api/files/${file.id}`, alt: defaultMediaLabel(kind, file.filename) } };
}

/**
 * Puts files the artifact already has into the text, in order and in view:
 * after the block the cursor is in when the person has put it somewhere
 * (`atCaret`), else at the end of the document. One change, so one Undo
 * takes them all out again.
 */
function insertAttached(editor: Editor, files: readonly AttachedFile[], atCaret: boolean): boolean {
  const { doc, selection } = editor.state;
  const position = atCaret ? caretLanding(doc, selection.$to) : endLanding(doc);
  return editor.chain().focus().insertContentAt(position, files.map(attachedMediaNode)).command(keepTrailingLine).scrollIntoView().run();
}

/** True when a drag holds files, from the desktop or from another page. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function pointOf(event: DragEvent): Point {
  return { x: event.clientX, y: event.clientY };
}

/**
 * The part of the page whose file drags this document takes: the nearest
 * ancestor marked as a drop zone (the artifact's page column, with its
 * title block and the space under the text), or the document alone. Null
 * while the page takes files itself: a new, empty page reads a dropped
 * file as its first content, until the document holds a media block (one
 * that is still uploading is not in the saved content yet, and the page
 * asks the same question, showsMedia). Read at each event: the document's
 * element is put on the page after this plugin starts.
 */
function dropZone(view: EditorView): HTMLElement | null {
  const marked = view.dom.closest<HTMLElement>(`[${dropZoneAttribute}]`);
  if (marked && takenByPage(marked) && !showsMedia(view.dom)) return null;
  return marked ?? view.dom;
}

/**
 * True for a drag event this document takes: files from outside, held
 * inside its zone, outside any box that takes files itself. A drag that
 * started in the document (a block moved by its grip, a picture dragged by
 * itself, which browsers also offer as a file) is the editor's own move.
 */
function takesDrag(view: EditorView, event: DragEvent): boolean {
  if (!view.editable || view.dragging || !carriesFiles(event) || !(event.target instanceof Element)) return false;
  if (event.target.closest("[data-slot=file-drop]")) return false;
  return dropZone(view)?.contains(event.target) === true;
}

/**
 * Keeps the event from the handlers under the window: the document's own
 * drop cursor and text drop, and the browser, which would open the file.
 * Other documents on the page still hear it at the window, and take their
 * own line away.
 */
function claim(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** True when a drag left the window, not only one element for the next. */
function leftWindow(event: DragEvent): boolean {
  if (event.relatedTarget instanceof Node) return false;
  return event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
}

/**
 * Files held over the document's page, and files sent to it from outside
 * the text. The listeners sit on the window, in the capture phase, so they
 * run before the editor's own: a held file shows one line, between two
 * blocks, where it will land (media-landing.ts), and a drop puts each file
 * there as a block of its own, in order. The line goes on any drop (also
 * one that another part of the page took), when the files leave the
 * window or the document's page, and when the drag is not heard from for a
 * moment, so it can never stay behind.
 */
function fileDragPlugin(editor: Editor): Plugin {
  return new Plugin({
    key: new PluginKey("mediaFileDrag"),
    // The page finds the document that takes files by this mark (documentIn).
    props: { attributes: { [takesFilesAttribute]: "" } },
    view: (view) => {
      const mark = new LandingMark();
      const hide = () => { mark.hide(); };
      const over = (event: DragEvent) => {
        if (!takesDrag(view, event)) { hide(); return; }
        claim(event);
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        mark.show(fileLanding(view, pointOf(event)).line);
      };
      const drop = (event: DragEvent) => {
        hide();
        if (!takesDrag(view, event)) return;
        claim(event);
        insertFiles(editor, [...(event.dataTransfer?.files ?? [])], fileLanding(view, pointOf(event)).pos);
      };
      const leave = (event: DragEvent) => {
        if (leftWindow(event)) hide();
      };
      // Until the person has put the cursor in the text, it sits at the start, where nobody chose it.
      let caretPlaced = view.hasFocus();
      const placed = () => { caretPlaced = true; };
      const sent = (event: Event) => {
        const request = readMediaRequest(event);
        if (request && view.editable && takeRequest(editor, view, request, caretPlaced)) event.preventDefault();
      };
      window.addEventListener("dragover", over, true);
      window.addEventListener("drop", drop, true);
      window.addEventListener("dragleave", leave, true);
      window.addEventListener("dragend", hide, true);
      view.dom.addEventListener(addMediaEvent, sent);
      view.dom.addEventListener("focus", placed);
      return {
        destroy: () => {
          hide();
          window.removeEventListener("dragover", over, true);
          window.removeEventListener("drop", drop, true);
          window.removeEventListener("dragleave", leave, true);
          window.removeEventListener("dragend", hide, true);
          view.dom.removeEventListener(addMediaEvent, sent);
          view.dom.removeEventListener("focus", placed);
        },
      };
    },
  });
}

/** Does what the page asked of the document (media-bridge.ts): files at a point or at the cursor, or files the artifact already has. */
function takeRequest(editor: Editor, view: EditorView, request: MediaRequest, caretPlaced: boolean): boolean {
  if ("attached" in request) return insertAttached(editor, request.attached, caretPlaced);
  return insertFiles(editor, request.files, request.point ? fileLanding(view, request.point).pos : undefined);
}

function uploadIdsIn(content: Fragment, into: Set<string>) {
  content.descendants((node) => {
    const uploadId: unknown = node.attrs.uploadId;
    if (node.type.name === MEDIA_NODE && typeof uploadId === "string" && uploadId) into.add(uploadId);
  });
}

/**
 * The upload ids of media blocks a change put into the document: inserted,
 * pasted, or given a new upload. A block's picker and its Replace write the
 * whole block again (setNodeMarkup, a replace step); a change of the one
 * attribute is read too, so no way of setting it is missed.
 */
export function uploadIdsAdded(tr: Transaction): string[] {
  const ids = new Set<string>();
  for (const step of tr.steps) {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) uploadIdsIn(step.slice.content, ids);
    else if (step instanceof AttrStep && step.attr === "uploadId" && typeof step.value === "string" && step.value) ids.add(step.value);
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
 * uploads its file and shows progress (media-view.tsx). A drop lands
 * between two blocks, anywhere on the document's page (fileDragPlugin).
 * Text pastes, drags inside the editor, and a paste in a code block are
 * left alone. Uploads are forgotten when the editor closes
 * (uploadCleanupPlugin).
 */
export const MediaInput = Extension.create({
  name: "mediaInput",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      uploadCleanupPlugin(),
      fileDragPlugin(editor),
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
