import { useEffect, useRef, useState } from "react";

import { readDrop, type DroppedFile } from "./dropped-files";

interface PageFileDropOptions {
  /** The part of the page that takes the files: the editor's pane, or the whole document. Read when the listeners start. */
  root: () => HTMLElement | null;
  /** Off for a reader, for a format whose files go elsewhere (a document's go into its text), and for a page that takes files another way. */
  enabled: boolean;
  /** The dropped files, each with its place in a dropped folder (dropped-files.ts). */
  onFiles: (files: DroppedFile[]) => void;
}

/** True when a drag holds files, from the desktop or from another page. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Parts of a page that are not the artifact: a box that takes files itself (FileUploader), a comment box, and anything in a dialog or a menu. */
const notThePage = "[data-slot=file-drop], [data-comment-skip], [role=dialog], [role=menu]";

/** True when the target takes files itself, or is not part of the artifact. */
function inDropBox(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(notThePage) !== null;
}

/**
 * Takes files dropped anywhere on an artifact's page, for the formats that
 * keep attachments beside their content. The listeners sit on `root` in the
 * capture phase, so the field under the pointer (a code editor, a grid
 * cell) never gets the file's name as text, and the browser never opens the
 * file in place of the page. `dragging` is true while files are held over
 * the page, so the page can say what a drop will do.
 */
export function usePageFileDrop({ root, enabled, onFiles }: PageFileDropOptions) {
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  const rootRef = useRef(root);
  useEffect(() => {
    onFilesRef.current = onFiles;
    rootRef.current = root;
  }, [onFiles, root]);

  useEffect(() => {
    const element = rootRef.current();
    if (!enabled || !element) return;
    const takes = (event: DragEvent) => carriesFiles(event) && !inDropBox(event.target);
    const over = (event: DragEvent) => {
      if (!takes(event)) { setDragging(false); return; }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    };
    const drop = (event: DragEvent) => {
      setDragging(false);
      if (!takes(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // Read now: the browser hands out a drop's folders only during the event.
      void readDrop(event.dataTransfer).then((files) => { if (files.length > 0) onFilesRef.current(files); });
    };
    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !element.contains(event.relatedTarget)) setDragging(false);
    };
    const end = () => { setDragging(false); };
    element.addEventListener("dragover", over, true);
    element.addEventListener("drop", drop, true);
    element.addEventListener("dragleave", leave, true);
    window.addEventListener("dragend", end, true);
    return () => {
      element.removeEventListener("dragover", over, true);
      element.removeEventListener("drop", drop, true);
      element.removeEventListener("dragleave", leave, true);
      window.removeEventListener("dragend", end, true);
      setDragging(false);
    };
  }, [enabled]);

  return { dragging: enabled && dragging };
}
