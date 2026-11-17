"use client";

import type { Editor } from "@tiptap/core";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { clampMediaWidth, mediaWidthRange } from "@/lib/files/media-rules";
import { cn } from "@/lib/utils";

import { keyedWidth, resizedWidth, resizeHandles, type ResizeHandle, type ResizeStart } from "./media-resize-rules";

/**
 * The handles that resize an image or a video in the editor: both edges
 * and the four corners (media-resize-rules.ts). They show while the block
 * is selected or under the pointer, on wider screens only: phones always
 * use the full column. The two edges are sliders, so the keyboard reaches
 * them while the block is selected: an arrow moves the edge five percent
 * the way it points, Home and End go to the narrowest and the full column.
 * The corners do with a pointer what the edges do, so they are not offered
 * a second time to the keyboard or a screen reader.
 */

interface ResizeHandlesProps {
  editor: Editor;
  /** The stored width in percent of the text column, or null for the file's own size. */
  width: number | null;
  /** True while the block is selected: the edges are then tab stops. */
  selected: boolean;
  /** Shows a width while a drag is on its way; null ends it. */
  onPreview: (width: number | null) => void;
  /** Stores a width. */
  onCommit: (width: number) => void;
}

const place: Record<ResizeHandle, string> = {
  left: "top-1/2 left-1 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full",
  right: "top-1/2 right-1 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full",
  "top-left": "top-1 left-1 size-2.5 cursor-nwse-resize rounded-xs",
  "top-right": "top-1 right-1 size-2.5 cursor-nesw-resize rounded-xs",
  "bottom-left": "bottom-1 left-1 size-2.5 cursor-nesw-resize rounded-xs",
  "bottom-right": "right-1 bottom-1 size-2.5 cursor-nwse-resize rounded-xs",
};

const edgeNames: Partial<Record<ResizeHandle, string>> = { left: "Resize from the left edge", right: "Resize from the right edge" };

/** The block's width now, in percent of the text column: the stored one, or the drawn one for a block at its file's own size. */
function widthNow(handle: HTMLElement, editor: Editor, stored: number | null): number {
  if (stored !== null) return stored;
  const drawn = handle.parentElement?.getBoundingClientRect().width ?? 0;
  return clampMediaWidth((drawn / (editor.view.dom.clientWidth || 1)) * 100);
}

function Handle({ handle, editor, width, selected, onPreview, onCommit }: ResizeHandlesProps & { handle: ResizeHandle }) {
  const start = useRef<ResizeStart | null>(null);
  const name = edgeNames[handle];
  const at = (event: PointerEvent) => (start.current ? resizedWidth(handle, start.current, { x: event.clientX, y: event.clientY }) : mediaWidthRange.max);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { width: box.width, height: box.height, column: editor.view.dom.clientWidth || 1, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    onCommit(at(event));
    start.current = null;
    onPreview(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (handle !== "left" && handle !== "right") return;
    const next = keyedWidth(handle, widthNow(event.currentTarget, editor, width), event.key);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onCommit(next);
  };
  const slider = name
    ? { role: "slider", tabIndex: selected ? 0 : -1, "aria-label": name, "aria-orientation": "horizontal" as const, "aria-valuemin": mediaWidthRange.min, "aria-valuemax": mediaWidthRange.max, "aria-valuenow": width ?? mediaWidthRange.max, "aria-valuetext": width === null ? "Original size" : `${String(width)}% of the text column`, onKeyDown }
    : { "aria-hidden": true };
  return (
    <div
      {...slider}
      data-media-resize={handle}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => { if (start.current) onPreview(at(event)); }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        onPreview(null);
      }}
      className={cn(
        "absolute hidden touch-none bg-foreground/40 opacity-0 shadow-xs ring-2 ring-background transition-opacity group-hover/media:opacity-100 group-data-[selected]/media:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring sm:block motion-reduce:transition-none",
        place[handle],
      )}
    />
  );
}

/** See the notes at the top of this file. */
export function ResizeHandles(props: ResizeHandlesProps) {
  return resizeHandles.map((handle) => <Handle key={handle} handle={handle} {...props} />);
}
