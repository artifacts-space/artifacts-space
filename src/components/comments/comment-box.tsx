"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** The comment box's frame, shared by the rich editor and the stand-in shown while it loads. */
export const commentBoxClass = "relative rounded-lg border border-input bg-transparent shadow-xs transition-colors dark:bg-input/30";

/** The box's text: 16px on phones, so iOS does not zoom in on focus, and the comment size from md up. */
export const commentTextClass = "text-base leading-6 md:text-md";

/** The box's height before it grows with its text. */
export function commentBoxHeight(compact: boolean): string {
  return compact ? "min-h-16" : "min-h-20";
}

/**
 * True once the comment box is near the window, pressed, or wanted from the
 * start: only then does the rich editor's code load. A comment box at the
 * foot of a long page costs nothing until someone scrolls to it. `attach`
 * is the ref for the element to watch.
 */
export function useWantsEditor(wantedAtStart: boolean): { attach: (element: HTMLDivElement | null) => void; wanted: boolean; want: () => void } {
  const [element, attach] = useState<HTMLDivElement | null>(null);
  const [wanted, setWanted] = useState(wantedAtStart);
  useEffect(() => {
    if (wanted || !element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setWanted(true);
    }, { rootMargin: "400px 0px" });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [element, wanted]);
  return { attach, wanted, want: () => { setWanted(true); } };
}

/**
 * What shows in the box's place until the editor's code is in: the same
 * frame and height, with the placeholder or the starting text. It is not a
 * field, so nothing typed can be lost; a press loads the editor and puts
 * the cursor in it.
 */
export function CommentBoxStandIn({ text, placeholder, compact, onPress }: { text: string; placeholder: string; compact: boolean; onPress?: () => void }) {
  return (
    // The same frame around the same box as the editor, so nothing moves when it arrives.
    <div aria-hidden data-slot="comment-box-loading" onPointerDown={onPress} className={cn(commentBoxClass, "cursor-text")}>
      <div className={cn(commentTextClass, commentBoxHeight(compact), "line-clamp-6 px-2.5 py-2 whitespace-pre-wrap", text ? "text-foreground" : "text-muted-foreground")}>
        {text || placeholder}
      </div>
    </div>
  );
}
