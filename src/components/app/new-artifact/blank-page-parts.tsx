"use client";

import { IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, type RefObject } from "react";

import { FileUploader } from "@/components/files/file-uploader";
import type { UploadItem } from "@/components/files/use-file-uploads";
import { Button } from "@/components/ui/button";

const fieldSelector = '[contenteditable="true"], textarea, input:not([type="file"])';

/** The content's first field a person types into: the rich editor, a text area, or a grid cell's input. */
function contentField(body: HTMLElement): HTMLElement | null {
  for (const field of body.querySelectorAll<HTMLElement>(fieldSelector)) {
    if (!field.hidden && field.getClientRects().length > 0) return field;
  }
  return null;
}

/**
 * Puts the cursor in the content: at its end in the rich editor, which loads
 * on demand and remounts after a paste, so this waits for its field to appear.
 */
export function focusContent(body: HTMLElement | null, place: "start" | "end" = "start") {
  if (!body) return;
  const focus = (field: HTMLElement) => {
    field.focus({ preventScroll: false });
    if (place !== "end" || field.getAttribute("contenteditable") !== "true") return;
    const selection = window.getSelection();
    selection?.selectAllChildren(field);
    selection?.collapseToEnd();
  };
  const found = contentField(body);
  if (found) {
    focus(found);
    return;
  }
  const observer = new MutationObserver(() => {
    const field = contentField(body);
    if (!field) return;
    observer.disconnect();
    focus(field);
  });
  observer.observe(body, { childList: true, subtree: true });
  // The editor appears within moments; stop watching if it never does.
  window.setTimeout(() => { observer.disconnect(); }, 5000);
}

/**
 * Brings a new artifact into view and puts the cursor in its title, on
 * mount and each time New artifact is pressed again. On phones the list sits
 * above the pane, so the pane scrolls up under the sticky header first.
 */
export function useFocusTitle(title: RefObject<HTMLInputElement | null>, page: RefObject<HTMLElement | null>, request: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(max-width: 767px)").matches) page.current?.scrollIntoView({ block: "start" });
    title.current?.focus({ preventScroll: true });
  }, [enabled, page, request, title]);
}

interface BlankPageFilesProps {
  items: readonly UploadItem[];
  onFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  /** Shown before anything was added: the quiet "Upload files" button. */
  showUpload: boolean;
  dragging: boolean;
  filesProblem: string | null;
}

/** The blank page's files section, when the page is a new artifact and there is something to show. */
export function BlankPageFilesSlot({ page, dragging }: { page: { active: boolean; eligible: boolean; filesProblem: string | null; uploads: { items: readonly UploadItem[]; remove: (key: string) => void }; onContent: (content: { files: File[] }) => void }; dragging: boolean }) {
  const { active, eligible, filesProblem, uploads, onContent } = page;
  if (!active || (!eligible && uploads.items.length === 0 && !filesProblem)) return null;
  return (
    <BlankPageFiles
      items={uploads.items}
      onFiles={(files) => { onContent({ files }); }}
      onRemove={(key) => { uploads.remove(key); }}
      showUpload={eligible}
      dragging={dragging}
      filesProblem={filesProblem}
    />
  );
}

/**
 * The blank page's files: a small "Upload files" button while the page is
 * empty, the uploads' progress and errors once files were dropped or picked,
 * and a hint while something is held over the page.
 */
export function BlankPageFiles({ items, onFiles, onRemove, showUpload, dragging, filesProblem }: BlankPageFilesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 sm:px-7">
      {dragging ? (
        <p data-slot="drop-hint" className="card-nested border-dashed px-4 py-6 text-center text-md text-muted-foreground">Drop to add it here</p>
      ) : null}
      {showUpload && !dragging ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} className="text-muted-foreground">
            <IconUpload aria-hidden /> Upload files
          </Button>
          <span>or drop them here. Pasted text picks its format.</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            aria-label="Upload files"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onFiles(files);
            }}
          />
        </div>
      ) : null}
      {filesProblem ? <p role="alert" className="text-sm text-tone-danger">{filesProblem}</p> : null}
      {items.length > 0 ? <FileUploader items={items} onFiles={onFiles} onRemove={onRemove} /> : null}
    </div>
  );
}
