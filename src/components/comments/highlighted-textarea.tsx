"use client";

import { useLayoutEffect, useMemo, useRef } from "react";

import { highlightDraft, type HighlightToken } from "@/lib/comments/composer-highlight";
import type { MentionKind } from "@/lib/comments/mentions";
import { cn } from "@/lib/utils";

/**
 * Every property that moves a glyph, shared by the textarea and the layer under
 * it so their text lines up exactly. Kerning and ligatures are off in both, so
 * a styled span in the layer cannot shift the letters next to it. The gutter is
 * reserved in both, so a classic scrollbar never narrows only one of them.
 */
const metrics =
  "border px-2.5 py-2 text-base leading-6 md:text-md whitespace-pre-wrap wrap-break-word [font-kerning:none] [font-variant-ligatures:none] [scrollbar-gutter:stable]";

/**
 * Styles that never change a glyph's width: color, background, decoration, a
 * stroke for weight, and box-shadow rings. Italic is the font's synthesized
 * slant, which keeps advance widths.
 */
const styleClasses = {
  mark: "text-muted-foreground",
  code: "rounded-xs bg-muted",
  codeMark: "rounded-xs bg-muted text-muted-foreground",
  heading: "[-webkit-text-stroke:0.03em_currentColor]",
  strong: "[-webkit-text-stroke:0.03em_currentColor]",
  em: "italic",
  del: "line-through decoration-muted-foreground",
  link: "underline decoration-muted-foreground underline-offset-2",
  mention: "",
} as const;

const mentionClasses: Record<MentionKind, string> = {
  person: "rounded-xs bg-mention text-mention-foreground ring-2 ring-mention",
  agent: "rounded-xs bg-mention-agent text-mention-agent-foreground ring-2 ring-mention-agent",
};

function tokenClass(token: HighlightToken) {
  return cn(token.styles.map((style) => styleClasses[style]), token.mention ? mentionClasses[token.mention] : null);
}

/** Tokens with their start offsets, which make stable keys. */
function keyed(tokens: HighlightToken[]) {
  let offset = 0;
  return tokens.map((token) => {
    const start = offset;
    offset += token.text.length;
    return { token, start };
  });
}

interface HighlightedTextareaProps extends Omit<React.ComponentProps<"textarea">, "value" | "ref"> {
  value: string;
  /** Handles that show as mention chips. */
  resolved: ReadonlyMap<string, MentionKind>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * A native textarea that shows Markdown formatting and resolved @mentions as
 * you type. The textarea's own text is transparent; a layer under it draws the
 * same text with styles. Typing, selection, IME, undo, spellcheck, and mobile
 * keyboards all stay native, because the textarea is still what you type in.
 */
export function HighlightedTextarea({ value, resolved, textareaRef, className, onScroll, ...props }: HighlightedTextareaProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => keyed(highlightDraft(value, resolved)), [value, resolved]);

  // Keeps the layer scrolled with the textarea after each change, as well as on scroll.
  useLayoutEffect(() => {
    if (layerRef.current && textareaRef.current) layerRef.current.scrollTop = textareaRef.current.scrollTop;
  }, [value, textareaRef]);

  return (
    <div className="relative rounded-lg bg-card dark:bg-input/30">
      <div ref={layerRef} aria-hidden data-slot="textarea-highlight" className={cn(metrics, "pointer-events-none absolute inset-0 overflow-hidden rounded-lg border-transparent text-foreground")}>
        {tokens.map(({ token, start }) => (
          <span key={start} className={tokenClass(token)}>
            {token.text}
          </span>
        ))}
        {/* A trailing newline needs a character after it, or the layer drops the empty last line. */}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onScroll={(event) => {
          if (layerRef.current) layerRef.current.scrollTop = event.currentTarget.scrollTop;
          onScroll?.(event);
        }}
        className={cn(
          metrics,
          "relative block field-sizing-content max-h-96 min-h-20 w-full resize-y overflow-y-auto rounded-lg border-input bg-transparent text-transparent caret-foreground outline-none transition-colors",
          "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      />
    </div>
  );
}
