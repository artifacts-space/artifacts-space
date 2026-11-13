"use client";

import { Component, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The comment box's frame, shared by the rich editor and the plain box shown until it loads. */
export const commentBoxClass = "relative rounded-lg border border-input bg-transparent shadow-xs transition-colors dark:bg-input/30";

/** The box's text: 16px on phones, so iOS does not zoom in on focus, and the comment size from md up. */
export const commentTextClass = "text-base leading-6 md:text-md";

/** The focus ring both boxes show. */
export const commentFocusClass = "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50";

/** The box's height before it grows with its text. */
export function commentBoxHeight(compact: boolean): string {
  return compact ? "min-h-16" : "min-h-20";
}

/** How tall the box grows before its text scrolls. */
export function commentBoxMaxHeight(compact: boolean): string {
  return compact ? "max-h-40" : "max-h-96";
}

/** ⌘↵ or Ctrl+↵, and not while an input method is still composing a character. */
export function isSubmitShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; nativeEvent: KeyboardEvent }): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;
}

/**
 * True once the comment box is near the window or focused, or wanted from
 * the start: only then does the rich editor's code load. A comment box at
 * the foot of a long page costs nothing until someone scrolls to it.
 * `attach` is the ref for the element to watch.
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

interface PlainCommentBoxProps extends Omit<React.ComponentProps<"textarea">, "className"> {
  compact: boolean;
}

/**
 * A plain text box with the rich box's name, frame, size, and text: what
 * shows while the rich box loads, and for good if it cannot load. What is
 * typed here is the comment's Markdown, and the rich box takes it over
 * when nobody is typing in it (comment-composer.tsx).
 */
export function PlainCommentBox({ compact, ...props }: PlainCommentBoxProps) {
  return (
    <div data-slot="comment-box-plain" className={cn(commentBoxClass, commentFocusClass)}>
      <textarea
        {...props}
        className={cn(
          "block w-full resize-none bg-transparent px-2.5 py-2 outline-none [field-sizing:content] placeholder:text-muted-foreground",
          commentTextClass,
          commentBoxHeight(compact),
          commentBoxMaxHeight(compact),
        )}
      />
    </div>
  );
}

/**
 * Keeps a failed load of the rich box from taking the page down: it shows
 * nothing, and the plain box stays.
 */
export class CommentEditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
