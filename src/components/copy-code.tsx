"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { useCopyToClipboard } from "./use-copy-to-clipboard";

/**
 * Inline code that copies itself when chosen: a URL or a command the reader
 * pastes into another app. It looks like inline code with a small copy mark,
 * which turns into a check for a moment once the value is on the clipboard.
 * The text never changes, so the line around it does not move.
 */
export function CopyCode({ value, className }: { value: string; className?: string | undefined }) {
  const { copied, copy } = useCopyToClipboard();
  const Mark = copied ? IconCheck : IconCopy;
  return (
    <>
      <button
        type="button"
        data-copy-code=""
        aria-label={`Copy ${value}`}
        onClick={() => void copy(value)}
        className={cn(
          "inline-code inline-flex max-w-full cursor-pointer items-center gap-1 text-left align-baseline outline-none [overflow-wrap:anywhere] hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <span>{value}</span>
        <Mark aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      </button>
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </>
  );
}
