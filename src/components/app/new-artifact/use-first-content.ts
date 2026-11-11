import { useEffect, useRef, useState, type RefObject } from "react";

import { leavesPasteToEditor } from "@/lib/create/new-artifact-rules";

/** What came onto an empty page: text, or files. */
export type FirstContent = { text: string } | { files: File[] };

interface FirstContentOptions {
  /** The whole editor: files dropped anywhere on it count. */
  page: RefObject<HTMLElement | null>;
  /** The body: text pasted or dropped here counts; the title and summary fields keep their own paste. */
  body: RefObject<HTMLElement | null>;
  /** Take pasted or dropped text: only while the page is a new artifact with an empty body. */
  text: boolean;
  /** Take dropped or pasted files: anywhere on the new artifact's page except a drop box, which takes its own. */
  files: boolean;
  onContent: (content: FirstContent) => void;
}

/** What this page takes right now: text over the body, and files anywhere but a drop box. */
interface Takes {
  text: boolean;
  files: boolean;
}

/** The files or text a paste or drop carries that the page takes; null when it takes neither. */
function contentOf(data: DataTransfer | null, takes: Takes): FirstContent | null {
  if (!data) return null;
  const files = Array.from(data.files);
  if (files.length > 0) return takes.files ? { files } : null;
  const text = data.getData("text/plain");
  if (!takes.text || text.trim() === "") return null;
  return leavesPasteToEditor(text, data.types.includes("text/html")) ? null : { text };
}

/** True when the target is a file drop box (FileUploader): the Files section's or the blank page's own. It takes its drops itself; anywhere else stays the page's. */
function inDropBox(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-slot=file-drop]") !== null;
}

/** True when the transfer is files the page takes, or text over the body it takes. */
function carriesContent(event: DragEvent, takes: Takes): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return (takes.files && types.includes("Files")) || (takes.text && types.includes("text/plain"));
}

/**
 * Catches the first content of a new artifact before the editor sees it: a
 * paste or drop into the empty body, or files dropped anywhere on the page
 * except a drop box (FileUploader), which takes its own drops.
 * The listeners run in the capture phase on an ancestor, so the rich editor
 * never pastes it a second time, and the content arrives exactly as it was
 * copied. `dragging` is true while files or text are held over the page.
 */
export function useFirstContent({ page, body, text, files, onContent }: FirstContentOptions) {
  const enabled = text || files;
  const [dragging, setDragging] = useState(false);
  const onContentRef = useRef(onContent);
  useEffect(() => { onContentRef.current = onContent; }, [onContent]);

  useEffect(() => {
    const root = page.current;
    if (!enabled || !root) return;
    // A drop box keeps its drops: the Files section's attaches them itself, and the blank page's hands them to onContent.
    const takes = (target: EventTarget | null): Takes => ({ text: text && target instanceof Node && body.current?.contains(target) === true, files: files && !inDropBox(target) });
    const take = (event: ClipboardEvent | DragEvent, content: FirstContent | null) => {
      if (!content) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      onContentRef.current(content);
    };
    const paste = (event: ClipboardEvent) => { take(event, contentOf(event.clipboardData, takes(event.target))); };
    // Any drop ends the drag, also one a drop box takes, so the page's hint never stays behind.
    const drop = (event: DragEvent) => { setDragging(false); take(event, contentOf(event.dataTransfer, takes(event.target))); };
    const over = (event: DragEvent) => {
      // Over a drop box, or carrying nothing the page takes: the box shows its own highlight, not the page's hint.
      if (!carriesContent(event, takes(event.target))) { setDragging(false); return; }
      event.preventDefault();
      setDragging(true);
    };
    const leave = (event: DragEvent) => { if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) setDragging(false); };
    root.addEventListener("paste", paste, true);
    root.addEventListener("drop", drop, true);
    root.addEventListener("dragover", over, true);
    root.addEventListener("dragleave", leave, true);
    return () => {
      root.removeEventListener("paste", paste, true);
      root.removeEventListener("drop", drop, true);
      root.removeEventListener("dragover", over, true);
      root.removeEventListener("dragleave", leave, true);
      setDragging(false);
    };
  }, [body, enabled, files, page, text]);

  return { dragging: enabled && dragging };
}
