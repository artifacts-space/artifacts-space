"use client";

import { useRef } from "react";

import { CopyIconButton } from "@/components/copy-icon-button";
import type { SyntaxKind, SyntaxLine } from "@/lib/syntax/tokens";
import { cn } from "@/lib/utils";

import { codeBlockModel } from "./code-block-model";
import { codeToolsClass } from "./code-tools";
import { scrollStopProps, scrollStopRing } from "./scroll-stop";
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

/** A quiet fill a step from the page and the card (--code), with no edge, as a well. */
const surfaceClass = "min-w-0 overflow-hidden rounded-lg bg-code text-code-foreground";

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
 * The language and the copy button, shown on hover and focus (code-tools.ts):
 * over the code's top right, or `inline` at the end of a title's row, so a
 * title truncates short of them instead of running under them. Copy takes
 * only the code, never the title.
 */
function CodeTools({ label, copyValue, copyLabel, inline = false }: { label: string; copyValue: string; copyLabel: string; inline?: boolean }) {
  return (
    <div data-code-tools="" className={cn(codeToolsClass, inline && "static shrink-0")}>
      <span className="truncate px-1.5 font-mono text-xs text-muted-foreground">{label}</span>
      <CopyIconButton value={copyValue} label={copyLabel} />
    </div>
  );
}

interface CodeAreaProps {
  /** The code as shown. */
  display: string;
  lines: SyntaxLine[] | null;
  /** What the code is (its title or language); screen readers hear "<name> code" when a scrolling area takes focus. */
  name: string;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Show a `$` prompt before the code: never selected, copied, or read aloud. */
  prompt?: boolean;
  className: string;
}

/** Block code fills the area and scrolls sideways unless it wraps; code after a prompt flows inline. */
function codeClass(prompt: boolean, wrap: boolean): string | undefined {
  if (prompt) return undefined;
  return wrap ? "block" : "block w-max min-w-full";
}

/** The code area. A named group and a tab stop only while it actually scrolls (see scroll-stop.ts). */
function CodeArea({ display, lines, name, wrap = false, prompt = false, className }: CodeAreaProps) {
  const scrollRef = useRef<HTMLPreElement>(null);
  const scrollable = useScrollable(scrollRef);
  return (
    <pre
      ref={scrollRef}
      {...scrollStopProps(scrollable, { label: `${name} code` })}
      className={cn("font-mono text-sm leading-6", scrollStopRing, wrap && "whitespace-pre-wrap break-words", className)}
    >
      {prompt ? <span aria-hidden="true" className="text-syntax-comment select-none">$ </span> : null}
      <code className={codeClass(prompt, wrap)}>{lines ? <HighlightedCode lines={lines} /> : display || " "}</code>
    </pre>
  );
}

export interface CodeBlockProps {
  code: string;
  /** The language label, such as "typescript" or "ts". Unknown languages show as plain text. A command defaults to "bash". */
  language?: string | null | undefined;
  /** An optional title, on a quiet line at the top of the block that ends with its tools. Not shown on a command. */
  title?: string | undefined;
  /** Lines highlighted on the server. Without them the block highlights itself in the browser. */
  lines?: SyntaxLine[] | null | undefined;
  /** Caps the height so long code scrolls inside the block (Markdown, ui, comments). */
  capHeight?: boolean;
  /**
   * "command" is one shell command on a single compact row: a `$` prompt that
   * is never copied, the command, and the copy button. It has no header.
   * "embedded" is the code area alone, on the code surface with no edge or
   * header, for code inside another frame that has its own copy button (the
   * docs live examples).
   */
  variant?: "block" | "command" | "embedded";
  /** The copy button's accessible name, so several buttons on a page stay distinct. */
  copyLabel?: string | undefined;
  /** Wraps long lines instead of scrolling sideways, for prose-like output such as error reports. */
  wrap?: boolean;
  className?: string | undefined;
}

/**
 * One shell command: a muted `$` prompt that is hidden from screen readers
 * and never selected or copied, the command, and an icon copy button.
 */
function CommandRow({ code, language, lines, copyLabel = "Copy command", className }: CodeBlockProps) {
  const model = codeBlockModel(code, language ?? "bash");
  const highlighted = useHighlightedLines(model.display, model.language, lines);
  return (
    <div data-code-block="" data-variant="command" className={cn(surfaceClass, "flex items-center", className)}>
      <CodeArea display={model.display} lines={highlighted} name="Command" prompt className="min-w-0 flex-1 overflow-x-auto py-2 pl-4" />
      <div className="flex shrink-0 items-center px-1.5">
        <CopyIconButton value={model.copyValue} label={copyLabel} />
      </div>
    </div>
  );
}

/** The code area alone, flush inside a frame that carries its own caption and copy button. */
function EmbeddedCode({ code, language, title, lines, capHeight = false, wrap = false, className }: CodeBlockProps) {
  const model = codeBlockModel(code, language);
  const highlighted = useHighlightedLines(model.display, model.language, lines);
  return (
    <div data-code-block="" data-variant="embedded" className={cn("min-w-0 bg-code text-code-foreground", className)}>
      <CodeArea
        display={model.display}
        lines={highlighted}
        name={title ?? model.label}
        wrap={wrap}
        className={cn("overflow-auto px-4 py-3.5", capHeight && "max-h-[32rem]")}
      />
    </div>
  );
}

/** A code block: the code with the tools over its top right, or a title row that ends with the tools, then the code. */
function CodeFigure({ code, language, title, lines, capHeight = false, copyLabel = "Copy code", wrap = false, className }: CodeBlockProps) {
  const model = codeBlockModel(code, language);
  const highlighted = useHighlightedLines(model.display, model.language, lines);
  return (
    <figure data-code-block="" className={cn(surfaceClass, "group/code relative", className)}>
      {title ? (
        <div className="flex min-w-0 items-center gap-2 pt-2 pr-2 pl-4">
          <figcaption className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</figcaption>
          <CodeTools label={model.label} copyValue={model.copyValue} copyLabel={copyLabel} inline />
        </div>
      ) : (
        <CodeTools label={model.label} copyValue={model.copyValue} copyLabel={copyLabel} />
      )}
      <CodeArea
        display={model.display}
        lines={highlighted}
        name={title ?? model.label}
        wrap={wrap}
        className={cn("overflow-auto px-4", title ? "pt-1 pb-3.5" : "py-3.5", capHeight && "max-h-[32rem]")}
      />
    </figure>
  );
}

/**
 * The one code block for every surface: code and JSON artifacts, fenced code
 * in Markdown and comments, the ui Code and Steps components, the docs, and
 * the setup screens. A quiet fill with no edge, the language and a copy
 * button over its top right on hover and focus, and colors from the
 * `--syntax-*` tokens. The
 * "command" variant is the same surface on one compact row; "embedded" is the
 * highlighted code alone, for a frame with its own caption.
 */
export function CodeBlock(props: CodeBlockProps) {
  if (props.variant === "command") return <CommandRow {...props} />;
  if (props.variant === "embedded") return <EmbeddedCode {...props} />;
  return <CodeFigure {...props} />;
}
