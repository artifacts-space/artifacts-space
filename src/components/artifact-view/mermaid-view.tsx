"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { checkMermaidSource } from "@/lib/mermaid-source";
import { svgDataUri } from "@/lib/svg";
import { cn } from "@/lib/utils";

import { renderMermaid, type RenderedDiagram } from "./mermaid-render";
import { ViewNotice } from "./view-notice";

type Outcome = { key: string; diagram: RenderedDiagram } | { key: string; error: string };

function SourceFallback({ code, title, reason }: { code: string; title: string; reason: string }) {
  return (
    <div className="space-y-3">
      <ViewNotice tone="warning" title={title}>{reason}</ViewNotice>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );
}

/**
 * A Mermaid diagram, rendered in the browser with securityLevel "strict" and
 * shown as an <img>, so nothing in the diagram can run. Mermaid loads only
 * when a diagram is on screen. The theme follows light and dark mode.
 */
export function MermaidView({ code, title, className }: { code: string; title?: string; className?: string }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const key = `${dark ? "dark" : "light"}:${code}`;
  const sourceProblem = checkMermaidSource(code);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (sourceProblem) return undefined;
    let cancelled = false;
    renderMermaid(code, dark)
      .then((diagram) => { if (!cancelled) setOutcome({ key, diagram }); })
      .catch((error: unknown) => {
        if (!cancelled) setOutcome({ key, error: error instanceof Error ? error.message : "Mermaid could not read this diagram." });
      });
    return () => { cancelled = true; };
  }, [code, dark, key, sourceProblem]);

  if (sourceProblem) return <SourceFallback code={code} title="This diagram could not be drawn." reason={sourceProblem} />;
  const current = outcome?.key === key ? outcome : null;
  if (current && "error" in current) return <SourceFallback code={code} title="This diagram could not be drawn." reason={current.error.slice(0, 300)} />;
  return (
    <figure className={cn("min-w-0", className)}>
      {title ? <figcaption className="mb-3 text-sm font-medium">{title}</figcaption> : null}
      <div className="flex min-h-24 justify-center overflow-x-auto rounded-md border bg-card p-4">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URI image, which next/image cannot optimize
          <img
            src={svgDataUri(current.diagram.svg)}
            width={current.diagram.width}
            height={current.diagram.height}
            alt={title ?? "Diagram"}
            className="h-auto max-w-full"
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
