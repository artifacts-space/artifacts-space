import { useEffect, useRef, useState, type RefObject } from "react";

/** What came onto an empty page: text, or files. */
export type FirstContent = { text: string } | { files: File[] };

interface FirstContentOptions {
  /** The whole editor: files dropped anywhere on it count. */
  page: RefObject<HTMLElement | null>;
  /** The body: text pasted or dropped here counts; the title and summary fields keep their own paste. */
  body: RefObject<HTMLElement | null>;
  /** Listen only while the page is a new artifact with an empty body. */
  enabled: boolean;
  onContent: (content: FirstContent) => void;
}

/** The files or text a paste or drop carries; null when it carries neither. */
function contentOf(data: DataTransfer | null, inBody: boolean): FirstContent | null {
  if (!data) return null;
  const files = Array.from(data.files);
  if (files.length > 0) return { files };
  const text = data.getData("text/plain");
  return inBody && text.trim() !== "" ? { text } : null;
}

/** True when the transfer is files, or text over the body. */
function carriesContent(event: DragEvent, inBody: boolean): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("Files") || (inBody && types.includes("text/plain"));
}

/**
 * Catches the first content of a new artifact before the editor sees it: a
 * paste or drop into the empty body, or files dropped anywhere on the page.
 * The listeners run in the capture phase on an ancestor, so the rich editor
 * never pastes it a second time, and the content arrives exactly as it was
 * copied. `dragging` is true while files or text are held over the page.
 */
export function useFirstContent({ page, body, enabled, onContent }: FirstContentOptions) {
  const [dragging, setDragging] = useState(false);
  const onContentRef = useRef(onContent);
  useEffect(() => { onContentRef.current = onContent; }, [onContent]);

  useEffect(() => {
    const root = page.current;
    if (!enabled || !root) return;
    const inBody = (target: EventTarget | null) => target instanceof Node && body.current?.contains(target) === true;
    const take = (event: ClipboardEvent | DragEvent, content: FirstContent | null) => {
      if (!content) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      onContentRef.current(content);
    };
    const paste = (event: ClipboardEvent) => { take(event, contentOf(event.clipboardData, inBody(event.target))); };
    const drop = (event: DragEvent) => { take(event, contentOf(event.dataTransfer, inBody(event.target))); };
    const over = (event: DragEvent) => {
      if (!carriesContent(event, inBody(event.target))) return;
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
  }, [body, enabled, page]);

  return { dragging: enabled && dragging };
}
