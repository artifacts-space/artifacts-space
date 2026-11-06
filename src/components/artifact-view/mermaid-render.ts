/** A rendered diagram: SVG text plus the size its viewBox asks for. */
export interface RenderedDiagram {
  svg: string;
  width: number;
  height: number;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function viewBoxSize(svg: string): { width: number; height: number } {
  const match = /viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  const width = Number(match?.[1] ?? 0);
  const height = Number(match?.[2] ?? 0);
  return width > 0 && height > 0 ? { width, height } : { width: 600, height: 400 };
}

async function renderNow(code: string, dark: boolean): Promise<RenderedDiagram> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    // Strict: no click handlers, no HTML in labels, output sanitized.
    securityLevel: "strict",
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: dark ? "dark" : "neutral",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  });
  counter += 1;
  const { svg } = await mermaid.render(`artifact-mermaid-${String(counter)}`, code);
  return { svg, ...viewBoxSize(svg) };
}

/**
 * Renders Mermaid source to SVG text. Mermaid loads only on the first call.
 * Renders run one at a time because Mermaid's configuration is global.
 * The caller shows the result through an <img>, so nothing in it can run.
 */
export function renderMermaid(code: string, dark: boolean): Promise<RenderedDiagram> {
  const run = queue.then(() => renderNow(code, dark));
  queue = run.catch(() => undefined);
  return run;
}
