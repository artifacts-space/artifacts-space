import type { Sketch, SynopsisGlyph } from "./synopsis-types";
import type { OgCardPalette } from "./card-palette";

/*
 * Pixel drawings for the synopsis card, built from flat boxes and simple SVG
 * so Satori can draw them. Nothing here reads user markup.
 */

const box = (style: Record<string, number | string>) => <div style={{ display: "flex", ...style }} />;

function DiagramGlyph({ p }: { p: OgCardPalette }) {
  const node = (left: number, top: number, color: string) => box({ position: "absolute", left, top, width: 40, height: 28, background: color, border: `5px solid ${p.ink}` });
  return (
    <div style={{ display: "flex", position: "relative", width: 120, height: 100 }}>
      {box({ position: "absolute", left: 57, top: 28, width: 6, height: 22, background: p.ink })}
      {box({ position: "absolute", left: 20, top: 47, width: 80, height: 6, background: p.ink })}
      {box({ position: "absolute", left: 17, top: 50, width: 6, height: 20, background: p.ink })}
      {box({ position: "absolute", left: 97, top: 50, width: 6, height: 20, background: p.ink })}
      {node(40, 0, p.blue)}
      {node(0, 68, p.blueLight)}
      {node(80, 68, p.blueLight)}
    </div>
  );
}

function VectorGlyph({ p }: { p: OgCardPalette }) {
  return (
    <div style={{ display: "flex", position: "relative", width: 120, height: 100 }}>
      {box({ position: "absolute", left: 6, top: 30, width: 62, height: 62, background: p.blue, border: `5px solid ${p.ink}` })}
      {box({ position: "absolute", left: 50, top: 4, width: 64, height: 64, background: p.blueLight, border: `5px solid ${p.ink}`, borderRadius: 40 })}
    </div>
  );
}

function PageGlyph({ p }: { p: OgCardPalette }) {
  const line = (width: number) => box({ width, height: 8, background: p.blue });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 84, height: 104, padding: "16px 14px", background: p.page, border: `5px solid ${p.ink}`, boxShadow: `5px 5px 0 0 ${p.shadowColor}` }}>
      {line(40)}
      {line(46)}
      {line(46)}
      {line(30)}
    </div>
  );
}

/** A drawing for a format that is never drawn from its content. */
export function Glyph({ glyph, p }: { glyph: SynopsisGlyph; p: OgCardPalette }) {
  if (glyph === "diagram") return <DiagramGlyph p={p} />;
  if (glyph === "vector") return <VectorGlyph p={p} />;
  return <PageGlyph p={p} />;
}

function barRects(values: number[], width: number, height: number, p: OgCardPalette) {
  const gap = values.length > 12 ? 4 : 8;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  return values.map((value, index) => {
    const barHeight = Math.max(6, Math.round(value * height));
    const x = index * (barWidth + gap);
    const cap = Math.min(10, barHeight);
    return (
      <g key={index}>
        <rect x={x} y={height - barHeight} width={barWidth} height={barHeight} fill={index % 2 === 0 ? p.blue : p.blueMid} />
        <rect x={x} y={height - barHeight} width={barWidth} height={cap} fill={p.blueLight} />
      </g>
    );
  });
}

function linePath(values: number[], width: number, height: number, p: OgCardPalette) {
  const inset = 8;
  const step = (width - inset * 2) / (values.length - 1);
  const points = values.map((value, index) => [inset + index * step, inset + (1 - value) * (height - inset * 2)] as const);
  const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <g>
      <polyline points={polyline} fill="none" stroke={p.blue} strokeWidth={6} strokeLinejoin="miter" />
      {points.map(([x, y], index) => (
        <rect key={index} x={x - 6} y={y - 6} width={12} height={12} fill={p.blueLight} stroke={p.ink} strokeWidth={3} />
      ))}
    </g>
  );
}

/** A small bar or line chart, sized to `width` × `height`. */
export function SketchView({ sketch, width, height, p }: { sketch: Sketch; width: number; height: number; p: OgCardPalette }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${String(width)} ${String(height)}`}>
      {sketch.shape === "bar" ? barRects(sketch.values, width, height, p) : linePath(sketch.values, width, height, p)}
    </svg>
  );
}
