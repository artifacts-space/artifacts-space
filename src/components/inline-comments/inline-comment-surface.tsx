"use client";

import { IconMessage } from "@tabler/icons-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useInlineComments, type InlineComments } from "./inline-comments-context";

/** True when the text under the surface is a field people type in: the editor has its own Comment button over a selection. */
function isEditor(surface: HTMLElement): boolean {
  return surface.querySelector("[data-comment-root][contenteditable=true]") !== null;
}

/** The box of the selection when it is a stretch of text inside `surface`, else null. */
function selectionBoxIn(surface: HTMLElement): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.commonAncestorContainer)) return null;
  const boxes = range.getClientRects();
  return boxes.item(boxes.length - 1);
}

/**
 * Comment, beside the end of a selection in a read view (the editor shows
 * its own in the menu over a selection). It appears once the selection
 * rests, and starts a comment on the selected words.
 */
function SelectionComment({ surface, inline }: { surface: HTMLElement; inline: InlineComments }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const hidden = inline.draft !== null;

  useEffect(() => {
    const update = () => { setBox(isEditor(surface) ? null : selectionBoxIn(surface)); };
    // Words selected before this ran (the page was still loading its script) get the button too.
    const first = requestAnimationFrame(update);
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(first);
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, { capture: true });
    };
  }, [surface]);

  if (!box || hidden) return null;
  return createPortal(
    <Button
      size="sm"
      variant="outline"
      data-slot="selection-comment"
      style={{ top: box.bottom + 6, left: Math.max(8, Math.min(box.right - 48, window.innerWidth - 128)) }}
      className="fixed z-40 bg-popover shadow-md"
      // Keep the selection: a press on the button must not clear it before the click reads it.
      onMouseDown={(event) => { event.preventDefault(); }}
      onClick={() => { inline.startComment(); }}
    >
      <IconMessage aria-hidden /> Comment
    </Button>,
    document.body,
  );
}

interface InlineCommentSurfaceProps {
  children: ReactNode;
  className?: string | undefined;
}

/**
 * Marks the text of a Markdown or Text artifact as the place its inline
 * comments are on: their words are highlighted in it, a click on highlighted
 * words opens the thread there, and selected words can be commented on.
 * Where the artifact has no inline comments (another format, or no access
 * to comments) it does nothing and takes no part in layout.
 */
export function InlineCommentSurface({ children, className }: InlineCommentSurfaceProps) {
  const inline = useInlineComments();
  const [surface, setElement] = useState<HTMLDivElement | null>(null);
  const attachSurface = inline?.attachSurface;
  const pointer = useRef({ x: 0, y: 0, frame: 0 });

  useEffect(() => (attachSurface && surface ? attachSurface(surface) : undefined), [attachSurface, surface]);
  useEffect(() => {
    const last = pointer.current;
    return () => { cancelAnimationFrame(last.frame); };
  }, []);

  /** A click on highlighted words (not the end of a drag that selected text) opens their thread. */
  function openAt(event: MouseEvent) {
    if (!inline || !window.getSelection()?.isCollapsed) return;
    const [id] = inline.commentsAt(event.clientX, event.clientY);
    if (id) inline.open(id);
  }

  /** The pointer shows a hand over highlighted words, so they read as something to open. Checked once per frame, at the pointer's latest place. */
  function pointAt(event: MouseEvent<HTMLDivElement>) {
    if (!inline) return;
    const element = event.currentTarget;
    const { commentsAt } = inline;
    pointer.current.x = event.clientX;
    pointer.current.y = event.clientY;
    if (pointer.current.frame !== 0) return;
    pointer.current.frame = requestAnimationFrame(() => {
      pointer.current.frame = 0;
      element.toggleAttribute("data-over-comment", commentsAt(pointer.current.x, pointer.current.y).length > 0);
    });
  }

  return (
    // The same element with or without inline comments, so turning them on never remounts the editor inside. Without them it takes no part in layout.
    <div
      ref={setElement}
      data-slot={inline ? "inline-comment-surface" : undefined}
      className={cn(inline ? "data-over-comment:cursor-pointer data-over-comment:**:cursor-pointer" : "contents", className)}
      onClick={inline ? openAt : undefined}
      onMouseMove={inline ? pointAt : undefined}
    >
      {children}
      {surface && inline ? <SelectionComment surface={surface} inline={inline} /> : null}
    </div>
  );
}
