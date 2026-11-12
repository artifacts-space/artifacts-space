"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { CodeBlock } from "@/components/code/code-block";
import { defaultDiagramView, type DiagramView } from "@/lib/markdown/fence-info";
import { diagramFailureReason, MERMAID_LANGUAGE } from "@/lib/markdown/mermaid-fence";
import { cn } from "@/lib/utils";

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
 * while it draws) with its source for screen readers, or, when Mermaid
 * cannot read the source, the short note and the source as an ordinary code
 * block. Never an empty space. `withSource` false leaves the code block out
 * of a failure, for a split view that shows the source beside it already.
 */
export function MarkdownDiagramBody({ code, state, withSource = true }: { code: string; state: DiagramState; withSource?: boolean }) {
  if (state.status === "failed") {
    return (
      <div className="space-y-2">
        <DiagramFailedNote reason={state.reason} />
        {withSource ? <CodeBlock code={code} language={MERMAID_LANGUAGE} capHeight /> : null}
      </div>
    );
  }
  return <DiagramFigure diagram={state.diagram} source={withSource ? code : undefined} zoomable />;
}

/**
 * The caption under a code block or diagram: small,
 * muted text below the block. Plain text only.
 */
export function BlockCaption({ caption }: { caption: string }) {
  return <figcaption data-block-caption="" data-comment-skip="" className="mt-2 text-sm text-muted-foreground">{caption}</figcaption>;
}

/**
 * Code and diagram together, for the Split view: side by side, the source on
 * the left, when the block is at least 36rem wide; stacked, the source above
 * the diagram, when it is narrower (phones, narrow panes). It measures its
 * own width, not the screen's, so it also stacks in a narrow side pane.
 */
export function SplitLayout({ code, diagram, className }: { code: ReactNode; diagram: ReactNode; className?: string }) {
  return (
    <div data-diagram-split="" className={cn("@container min-w-0", className)}>
      <div className="grid min-w-0 gap-3 @xl:grid-cols-2 @xl:items-start">
        <div className="min-w-0">{code}</div>
        <div className="min-w-0">{diagram}</div>
      </div>
    </div>
  );
}

/** The source as an ordinary code block: the language label, and the copy button. */
function SourceCode({ code }: { code: string }) {
  return <CodeBlock code={code} language={MERMAID_LANGUAGE} capHeight />;
}

/** The drawn diagram (deferred until it nears the viewport), alone or beside its source. */
function DrawnDiagram({ code, split }: { code: string; split: boolean }) {
  const { scopeRef, state } = useMermaidDiagram(code, { deferUntilNear: true });
  const body = <MarkdownDiagramBody code={code} state={state} withSource={!split} />;
  return (
    <div ref={scopeRef} data-markdown-diagram="" data-diagram-state={state.status} className="min-w-0">
      {split ? <SplitLayout code={<SourceCode code={code} />} diagram={body} /> : body}
    </div>
  );
}

interface MarkdownMermaidProps {
  code: string;
  /** How the block shows (its `view` attribute); the diagram alone by default. */
  view?: DiagramView | null;
  caption?: string | null;
}

/**
 * A fenced ```mermaid block in a Markdown document, shown in its view
 * (markdown-dialect.md): Preview, the default, draws the diagram; Code shows
 * the source as a code block and never loads Mermaid; Split shows both. It
 * draws with the mermaid format's renderer and security settings, only as
 * it nears the viewport, in the colors of the theme and light or dark mode.
 * A caption shows below. The Markdown keeps the fenced source.
 */
export function MarkdownMermaid({ code, view, caption }: MarkdownMermaidProps) {
  const shown = view ?? defaultDiagramView;
  return (
    <figure data-markdown-mermaid="" data-diagram-view={shown} className="min-w-0 not-first:mt-5">
      {shown === "code" ? <SourceCode code={code} /> : <DrawnDiagram code={code} split={shown === "split"} />}
      {caption ? <BlockCaption caption={caption} /> : null}
    </figure>
  );
}
