"use client";

import { useMemo } from "react";

import { svgDataUri } from "@/lib/svg";
import { minReadableWidth } from "@/lib/svg-text-size";
import { cn } from "@/lib/utils";

import { DiagramZoom } from "./diagram-zoom";
import type { RenderedDiagram } from "./mermaid-render";
import { useMermaidDiagram } from "./use-mermaid-diagram";
import { ViewNotice } from "./view-notice";

function SourceFallback({ code, title, reason }: { code: string; title: string; reason: string }) {
  return (
    <div className="space-y-3">
      <ViewNotice tone="warning" title={title}>{reason}</ViewNotice>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );
}

/**
 * A Mermaid diagram, rendered in the browser with securityLevel "strict" and
 * shown as an <img>, so nothing in the diagram can run. Mermaid loads only
 * when a diagram is on screen. Colors and the font come from the design
 * tokens in scope (light, dark, or a ThemeScope); see mermaid-theme.ts for the
 * hairline look. The image shrinks to fit only while its text stays at 13px
 * or larger; past that, the frame scrolls sideways.
 */
export function MermaidView({ code, title, className }: { code: string; title?: string; className?: string }) {
  const { scopeRef, state } = useMermaidDiagram(code);
  return (
    <div ref={scopeRef} className={cn("min-w-0", className)}>
      {state.status === "failed" ? <SourceFallback code={code} title="This diagram could not be drawn." reason={state.reason} /> : <DiagramFigure title={title} diagram={state.diagram} />}
    </div>
  );
}

interface DiagramFigureProps {
  title?: string | undefined;
  diagram: RenderedDiagram | null;
  /** Read to screen readers after the image, so the diagram's content stays available as text. */
  source?: string | undefined;
  /** A click on the image opens it larger (diagrams in documents). */
  zoomable?: boolean;
  /** Draw the hairline frame; off when the diagram sits inside a block that has its own. */
  framed?: boolean;
}

/** The drawn image, as wide as it can be while its text stays readable. */
function DiagramImage({ diagram, src, alt }: { diagram: RenderedDiagram; src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data URI image, which next/image cannot optimize
    <img
      src={src}
      width={diagram.width}
      height={diagram.height}
      alt={alt}
      className="h-auto max-w-full shrink-0"
      style={{ minWidth: `${String(minReadableWidth(diagram.width, diagram.smallestFont))}px` }}
    />
  );
}

/**
 * The frame a Mermaid diagram shows in: the image once drawn, a quiet
 * placeholder while it draws. Shared by the mermaid format and diagrams in
 * Markdown documents. `source`, when given, is read to screen readers after
 * the image, so the diagram's content stays available as text.
 */
export function DiagramFigure({ title, diagram, source, zoomable = false, framed = true }: DiagramFigureProps) {
  const alt = title ?? "Diagram";
  // Encoded once per drawing, and shared by the image and its zoomed copy.
  const src = useMemo(() => (diagram ? svgDataUri(diagram.svg) : ""), [diagram]);
  return (
    <figure className="min-w-0">
      {title ? <figcaption className="mb-3 text-md font-medium">{title}</figcaption> : null}
      {/* justify-center-safe: when the diagram is wider than the frame, it starts at the left edge so all of it can be scrolled to. */}
      <div className={cn("flex min-h-24 justify-center-safe overflow-x-auto bg-card px-4 py-6 sm:px-6", framed && "card-nested")}>
        {diagram ? (
          zoomable ? <DiagramZoom src={src} width={diagram.width} height={diagram.height} label={alt}><DiagramImage diagram={diagram} src={src} alt={alt} /></DiagramZoom> : <DiagramImage diagram={diagram} src={src} alt={alt} />
        ) : (
          <div role="status" className="h-24 w-full max-w-md animate-pulse rounded-sm bg-muted motion-reduce:animate-none">
            <span className="sr-only">Drawing diagram…</span>
          </div>
        )}
      </div>
      {source ? (
        <div className="sr-only">
          <p>Diagram source, in Mermaid:</p>
          <pre>{source}</pre>
        </div>
      ) : null}
    </figure>
  );
}
