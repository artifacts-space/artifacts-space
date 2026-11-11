"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { checkMermaidSource } from "@/lib/mermaid-source";

import { embeddedFontFace, readFontFamily, readPalette } from "./mermaid-palette";
import { renderMermaid, type DiagramStyle, type RenderedDiagram } from "./mermaid-render";
import { useDarkTheme, useThemeKey } from "./theme-scope-context";

type Outcome = { key: string; diagram: RenderedDiagram } | { key: string; error: string };

/** Reads colors and fonts in scope at `element` and waits for the font, so Mermaid measures text as it will draw it. */
async function diagramStyle(element: Element): Promise<DiagramStyle> {
  const fontFamily = readFontFamily(element);
  const [fontFace] = await Promise.all([embeddedFontFace(fontFamily), document.fonts.load(`14px ${fontFamily}`).catch(() => [])]);
  return { palette: readPalette(element), fontFamily, fontFace };
}

/** A diagram's state: being drawn, drawn, or failed with a reason. */
export type DiagramState =
  | { status: "drawing"; diagram: RenderedDiagram | null }
  | { status: "drawn"; diagram: RenderedDiagram }
  | { status: "failed"; reason: string };

export interface MermaidDiagram {
  /** Put on the element whose tokens (colors, font) the diagram should use. */
  scopeRef: RefObject<HTMLDivElement | null>;
  state: DiagramState;
}

/** How far outside the viewport a deferred diagram starts drawing, so it is ready by the time it scrolls in. */
const nearViewport = "600px 0px";

/** True once `ref`'s element has come near the viewport; true from the start when `defer` is off or the browser cannot tell. */
function useNearViewport(ref: RefObject<HTMLElement | null>, defer: boolean): boolean {
  const [near, setNear] = useState(() => !defer || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: nearViewport });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [near, ref]);
  return near;
}

interface DiagramOptions {
  /** Keep the last diagram on screen while the next one draws, so a live preview never blinks. */
  keepPrevious?: boolean;
  /** Wait until the diagram is near the viewport before drawing: for documents, which can hold many. */
  deferUntilNear?: boolean;
  /** Draw nothing (and never load Mermaid) while true: a block showing only its source. */
  skip?: boolean;
}

/**
 * Draws Mermaid source with the shared renderer (securityLevel "strict", no
 * HTML labels; see mermaid-render.ts), in the colors and font in scope at
 * `scopeRef`, and draws again when light or dark mode or the theme changes.
 * Mermaid loads only on the first draw. Renders run one at a time, so
 * documents defer each diagram until it nears the viewport.
 */
export function useMermaidDiagram(code: string, { keepPrevious = false, deferUntilNear = false, skip = false }: DiagramOptions = {}): MermaidDiagram {
  const dark = useDarkTheme();
  const themeKey = useThemeKey();
  const key = `${dark ? "dark" : "light"}:${themeKey}:${code}`;
  const sourceProblem = checkMermaidSource(code);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lastDrawn, setLastDrawn] = useState<RenderedDiagram | null>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(scopeRef, deferUntilNear);

  useEffect(() => {
    const element = scopeRef.current;
    if (skip || sourceProblem || !near || !element) return undefined;
    let cancelled = false;
    diagramStyle(element)
      .then((style) => renderMermaid(code, style))
      .then((diagram) => {
        if (cancelled) return;
        setOutcome({ key, diagram });
        setLastDrawn(diagram);
      })
      .catch((error: unknown) => {
        if (!cancelled) setOutcome({ key, error: error instanceof Error ? error.message : "Mermaid could not read this diagram." });
      });
    return () => { cancelled = true; };
  }, [code, key, near, skip, sourceProblem]);

  const current = outcome?.key === key ? outcome : null;
  return { scopeRef, state: diagramState(sourceProblem, current, keepPrevious ? lastDrawn : null) };
}

/** The state to show: a source problem or a failed draw first, then this source's drawing, else drawing (with `previous` on screen). */
function diagramState(sourceProblem: string | null, current: Outcome | null, previous: RenderedDiagram | null): DiagramState {
  if (sourceProblem) return { status: "failed", reason: sourceProblem };
  if (!current) return { status: "drawing", diagram: previous };
  if ("error" in current) return { status: "failed", reason: current.error.slice(0, 300) };
  return { status: "drawn", diagram: current.diagram };
}
