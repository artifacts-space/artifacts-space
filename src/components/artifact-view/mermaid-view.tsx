"use client";

import { useEffect, useRef, useState } from "react";

import { checkMermaidSource } from "@/lib/mermaid-source";
import { svgDataUri } from "@/lib/svg";
import { minReadableWidth } from "@/lib/svg-text-size";
import { cn } from "@/lib/utils";

import { embeddedFontFace, readFontFamily, readPalette } from "./mermaid-palette";
import { renderMermaid, type DiagramStyle, type RenderedDiagram } from "./mermaid-render";
import { useDarkTheme, useThemeKey } from "./theme-scope-context";
import { ViewNotice } from "./view-notice";

type Outcome = { key: string; diagram: RenderedDiagram } | { key: string; error: string };

/** Reads colors and fonts in scope at `element` and waits for the font, so Mermaid measures text as it will draw it. */
async function diagramStyle(element: Element): Promise<DiagramStyle> {
  const fontFamily = readFontFamily(element);
  const [fontFace] = await Promise.all([embeddedFontFace(fontFamily), document.fonts.load(`14px ${fontFamily}`).catch(() => [])]);
  return { palette: readPalette(element), fontFamily, fontFace };
}

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
  const dark = useDarkTheme();
  const themeKey = useThemeKey();
  const key = `${dark ? "dark" : "light"}:${themeKey}:${code}`;
  const sourceProblem = checkMermaidSource(code);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scopeRef.current;
    if (sourceProblem || !element) return undefined;
    let cancelled = false;
    diagramStyle(element)
      .then((style) => renderMermaid(code, style))
      .then((diagram) => { if (!cancelled) setOutcome({ key, diagram }); })
      .catch((error: unknown) => {
        if (!cancelled) setOutcome({ key, error: error instanceof Error ? error.message : "Mermaid could not read this diagram." });
      });
    return () => { cancelled = true; };
  }, [code, key, sourceProblem]);

  const current = outcome?.key === key ? outcome : null;
  const problem = sourceProblem ?? (current && "error" in current ? current.error.slice(0, 300) : null);
  return (
    <div ref={scopeRef} className={cn("min-w-0", className)}>
      {problem ? <SourceFallback code={code} title="This diagram could not be drawn." reason={problem} /> : <Diagram title={title} diagram={current && "diagram" in current ? current.diagram : null} />}
    </div>
  );
}

function Diagram({ title, diagram }: { title?: string | undefined; diagram: RenderedDiagram | null }) {
  return (
    <figure className="min-w-0">
      {title ? <figcaption className="mb-3 text-md font-medium">{title}</figcaption> : null}
      {/* justify-center-safe: when the diagram is wider than the frame, it starts at the left edge so all of it can be scrolled to. */}
      <div className="flex min-h-24 justify-center-safe overflow-x-auto card-nested bg-card px-4 py-6 sm:px-6">
        {diagram ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URI image, which next/image cannot optimize
          <img
            src={svgDataUri(diagram.svg)}
            width={diagram.width}
            height={diagram.height}
            alt={title ?? "Diagram"}
            className="h-auto max-w-full shrink-0"
            style={{ minWidth: `${String(minReadableWidth(diagram.width, diagram.smallestFont))}px` }}
          />
        ) : (
          <div role="status" className="h-24 w-full max-w-md animate-pulse rounded-sm bg-muted motion-reduce:animate-none">
            <span className="sr-only">Drawing diagram…</span>
          </div>
        )}
      </div>
    </figure>
  );
}
