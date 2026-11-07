"use client";

import { useRef } from "react";

import { CopyIconButton } from "@/components/copy-icon-button";
import type { SyntaxKind, SyntaxLine } from "@/lib/syntax/tokens";
import { cn } from "@/lib/utils";

import { codeBlockModel } from "./code-block-model";
import { useHighlightedLines } from "./use-highlighted-lines";
import { useScrollable } from "./use-scrollable";

const kindClass: Record<SyntaxKind, string> = {
  keyword: "text-syntax-keyword",
  string: "text-syntax-string",
  comment: "text-syntax-comment",
  number: "text-syntax-number",
  function: "text-syntax-function",
  property: "text-syntax-property",
  punctuation: "text-syntax-punctuation",
  inserted: "text-syntax-inserted",
  deleted: "text-syntax-deleted",
};

function HighlightedCode({ lines }: { lines: readonly SyntaxLine[] }) {
  return lines.map((line, index) => (
    // Lines never reorder, so the index is a stable key.
    <span key={index}>
      {line.map((token, tokenIndex) => (token.kind ? <span key={tokenIndex} className={kindClass[token.kind]}>{token.text}</span> : token.text))}
      {index < lines.length - 1 ? "\n" : null}
    </span>
  ));
}

/**
 * The header bar. Without a title the language sits left; with one, the title
 * sits left and the language moves right, beside the copy button. Copy takes
 * only the code, never the title.
 */
function CodeHeader({ title, label, copyValue }: { title: string | undefined; label: string; copyValue: string }) {
  return (
    <figcaption className="flex h-9 items-center gap-2 border-b border-code-border pr-1.5 pl-4 text-xs text-muted-foreground">
      {title ? <span className="min-w-0 truncate font-medium text-foreground">{title}</span> : <span className="min-w-0 truncate font-mono">{label}</span>}
      <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        {title ? <span className="truncate font-mono">{label}</span> : null}
        <CopyIconButton value={copyValue} label="Copy code" />
      </span>
    </figcaption>
  );
}

export interface CodeBlockProps {
  code: string;
  /** The language label, such as "typescript" or "ts". Unknown languages show as plain text. */
  language?: string | null | undefined;
  /** An optional title at the left of the header. */
  title?: string | undefined;
  /** Lines highlighted on the server. Without them the block highlights itself in the browser. */
  lines?: SyntaxLine[] | null | undefined;
  /** Caps the height so long code scrolls inside the block (Markdown, ui, comments). */
  capHeight?: boolean;
  className?: string | undefined;
}

/**
 * The one code block for every surface: code and JSON artifacts, fenced code
 * in Markdown and comments, and the ui Code and Steps components. A raised
 * surface with a hairline edge, a header with the language and a copy
 * button, and colors from the `--syntax-*` tokens.
 */
export function CodeBlock({ code, language, title, lines, capHeight = false, className }: CodeBlockProps) {
  const model = codeBlockModel(code, language);
  const highlighted = useHighlightedLines(model.display, model.language, lines);
  const scrollRef = useRef<HTMLPreElement>(null);
  const scrollable = useScrollable(scrollRef);
  return (
    <figure data-code-block="" className={cn("min-w-0 overflow-hidden rounded-lg border border-code-border bg-code text-code-foreground", className)}>
      <CodeHeader title={title} label={model.label} copyValue={model.copyValue} />
      <pre
        ref={scrollRef}
        tabIndex={scrollable ? 0 : undefined}
        role={scrollable ? "region" : undefined}
        aria-label={scrollable ? `${title ?? model.label} code` : undefined}
        className={cn(
          "overflow-auto px-4 py-3.5 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          capHeight && "max-h-[32rem]",
        )}
      >
        <code className="block w-max min-w-full">{highlighted ? <HighlightedCode lines={highlighted} /> : model.display || " "}</code>
      </pre>
    </figure>
  );
}
