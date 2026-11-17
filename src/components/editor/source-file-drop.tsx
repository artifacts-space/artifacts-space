"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { UploadList } from "@/components/files/file-uploader";
import type { UploadItem } from "@/components/files/use-file-uploads";

import { dropZoneAttribute, takenByPage } from "./rich/media-bridge";
import { useEditorMedia } from "./rich/media-context";
import { pasteIsFiles } from "./rich/media-upload-rules";
import type { UploadState } from "./rich/media-uploads";
import { mediaLineFor, offsetOfLine, ownParagraphInsert } from "./source-media-rules";

/**
 * Files dropped or pasted on a document's source (View source). Each file
 * uploads as it does in the document, a few at a time, and then its line of
 * Markdown goes into the source as a paragraph of its own: at the line the
 * file was dropped on, or at the cursor. The lines go in as typing does, so
 * the field's own Undo takes them out, and in the order the files were
 * dropped. Progress and refusals show under the field, by file name; a file
 * that failed stays listed, with its reason, until it is removed.
 */

interface Waiting {
  key: string;
  file: File;
  state: UploadState;
  stop: () => void;
}

function itemOf({ key, file, state }: Waiting): UploadItem {
  const base = { key, name: file.name, size: file.size, file: null };
  if (state.status === "failed") return { ...base, status: "error", progress: 0, error: state.message };
  if (state.status === "uploading") return { ...base, status: "uploading", progress: state.progress, error: null };
  return { ...base, status: state.status === "done" ? "ready" : "checking", progress: 0, error: null };
}

/** Where in the source a point of the window is, or null when the browser cannot say. */
function offsetAtPoint(field: HTMLTextAreaElement, x: number, y: number): number | null {
  // Not every browser has it, whatever the types say.
  const position = "caretPositionFromPoint" in document ? document.caretPositionFromPoint(x, y) : null;
  if (position?.offsetNode === field) return position.offset;
  // No answer inside a text field (some browsers): the line at that height, from the field's own line height.
  const style = getComputedStyle(field);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;
  const top = field.getBoundingClientRect().top + (Number.parseFloat(style.paddingTop) || 0) - field.scrollTop;
  return offsetOfLine(field.value, Math.max(0, Math.floor((y - top) / lineHeight)));
}

/** Puts `insert` into the field at `at` as typing would, so the field's Undo takes it out and the editor hears the change. */
function typeInto(field: HTMLTextAreaElement, at: number, insert: string) {
  field.focus({ preventScroll: true });
  field.setSelectionRange(at, at);
  // The one way a script's edit joins a text field's Undo history.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- no replacement puts a script's edit into the field's Undo history
  if (document.execCommand("insertText", false, insert)) return;
  field.setRangeText(insert, at, at, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** True when a drag holds files, from the desktop or from another page. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** The files a paste carries when it is files and not text (media-upload-rules.ts). */
function pastedFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  const files = [...data.files];
  return pasteIsFiles({ fileNames: files.map((file) => file.name), text: data.getData("text/plain"), html: data.getData("text/html") }) ? files : [];
}

/**
 * Takes file drops and pastes for the source field `field` while `enabled`
 * (a Markdown artifact's source). Returns the list that shows the uploads
 * under the field.
 */
export function useSourceFileDrop(field: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const media = useEditorMedia();
  const [items, setItems] = useState<UploadItem[]>([]);
  const waiting = useRef<Waiting[]>([]);
  const nextKey = useRef(0);
  const show = useCallback(() => { setItems(waiting.current.map(itemOf)); }, []);

  /** Writes the lines of the files that are ready, in the order they were dropped: a file waits for those before it. */
  const settle = useCallback(() => {
    const target = field.current;
    for (;;) {
      // A file that failed stays listed and holds nothing up; one still uploading holds the ones dropped after it.
      const index = waiting.current.findIndex((entry) => entry.state.status !== "failed");
      const first = waiting.current[index];
      if (!target || first?.state.status !== "done") break;
      waiting.current.splice(index, 1);
      first.stop();
      const { at, insert, caret } = ownParagraphInsert(target.value, target.selectionEnd, mediaLineFor(first.state.file));
      typeInto(target, at, insert);
      target.setSelectionRange(caret, caret);
    }
    show();
  }, [field, show]);

  const add = useCallback((files: readonly File[]) => {
    void import("./rich/media-uploads").then((uploads) => {
      for (const file of files) {
        nextKey.current += 1;
        const uploadId = uploads.queueUpload(file);
        const entry: Waiting = { key: `source-upload-${String(nextKey.current)}`, file, state: uploads.uploadState(uploadId), stop: () => undefined };
        const unsubscribe = uploads.subscribeUpload(uploadId, () => {
          entry.state = uploads.uploadState(uploadId);
          settle();
        });
        entry.stop = () => { unsubscribe(); uploads.forgetUpload(uploadId); };
        waiting.current.push(entry);
        uploads.startUpload(uploadId, media.upload);
      }
      settle();
    }).catch(() => undefined);
  }, [media.upload, settle]);

  const remove = useCallback((key: string) => {
    const index = waiting.current.findIndex((entry) => entry.key === key);
    if (index === -1) return;
    waiting.current.splice(index, 1)[0]?.stop();
    settle();
  }, [settle]);

  useEffect(() => {
    const target = field.current;
    if (!enabled || !target) return;
    // The page column around the field, so a file dropped on the title block or under the field is taken too. A page that takes files itself (a new, empty page) keeps them.
    const zone = target.closest<HTMLElement>(`[${dropZoneAttribute}]`);
    const root = zone && !takenByPage(zone) ? zone : target;
    const takes = (event: DragEvent) => carriesFiles(event) && event.target instanceof Element && event.target.closest("[data-slot=file-drop]") === null;
    const over = (event: DragEvent) => {
      if (!takes(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!takes(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      // Over the field, the files go to the line under the pointer; anywhere else on the page, to the cursor.
      const at = event.target === target ? offsetAtPoint(target, event.clientX, event.clientY) : null;
      if (at !== null) target.setSelectionRange(at, at);
      add(files);
    };
    const paste = (event: ClipboardEvent) => {
      const files = pastedFiles(event);
      if (files.length === 0) return;
      event.preventDefault();
      add(files);
    };
    root.addEventListener("dragover", over, true);
    root.addEventListener("drop", drop, true);
    target.addEventListener("paste", paste);
    return () => {
      root.removeEventListener("dragover", over, true);
      root.removeEventListener("drop", drop, true);
      target.removeEventListener("paste", paste);
    };
  }, [add, enabled, field]);

  // The uploads belong to this field: when it goes (Hide source, another artifact), what has not landed is let go.
  useEffect(() => () => {
    for (const entry of waiting.current) entry.stop();
    waiting.current = [];
  }, []);

  // Closing the tab now would lose a file that has not reached the text yet.
  useLeaveGuard(items.some((item) => item.status !== "error"));
  return { list: <UploadList items={items} onRemove={remove} /> };
}
