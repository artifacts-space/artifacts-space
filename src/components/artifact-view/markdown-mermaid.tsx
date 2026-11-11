"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import { CodeBlock } from "@/components/code/code-block";
import { diagramFailureReason, MERMAID_LANGUAGE } from "@/lib/markdown/mermaid-fence";

import { DiagramFigure } from "./mermaid-view";
import { useMermaidDiagram, type DiagramState } from "./use-mermaid-diagram";

/** What a document says when its diagram cannot be drawn. */
export const diagramFailedTitle = "Couldn’t draw this diagram.";

/**
 * The short note above a diagram that could not be drawn: the title, and the
 * first line of Mermaid's reason. The editor shows it above the source too.
 */
export function DiagramFailedNote({ reason }: { reason: string }) {
  const short = diagramFailureReason(reason);
  return (
    <p role="note" className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
      <IconAlertTriangle aria-hidden className="mt-1 size-4 shrink-0 text-tone-warning" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{diagramFailedTitle}</span>
        {short ? ` ${short}` : null}
      </span>
    </p>
  );
}

/**
 * A diagram in a document, by state: the drawn image (or its placeholder
 * while it draws), or, when Mermaid cannot read the source, the short note
 * and the source as an ordinary code block. Never an empty space.
 */
export function MarkdownDiagramBody({ code, state }: { code: string; state: DiagramState }) {
  if (state.status === "failed") {
    return (
      <div className="space-y-2">
        <DiagramFailedNote reason={state.reason} />
        <CodeBlock code={code} language={MERMAID_LANGUAGE} capHeight />
      </div>
    );
  }
  return <DiagramFigure diagram={state.diagram} />;
}

/**
 * A fenced ```mermaid block in a Markdown document, drawn as its diagram with
 * the mermaid format's renderer and security settings. Mermaid loads only
 * when a document has a diagram. It follows light and dark mode and the
 * artifact's theme. The Markdown keeps the fenced source.
 */
export function MarkdownMermaid({ code }: { code: string }) {
  const { scopeRef, state } = useMermaidDiagram(code);
  return (
    <div ref={scopeRef} data-markdown-diagram="" data-diagram-state={state.status} className="min-w-0 not-first:mt-5">
      <MarkdownDiagramBody code={code} state={state} />
    </div>
  );
}
