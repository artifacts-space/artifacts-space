import type { ReactNode } from "react";

import { siteCardPalette, type OgCardPalette } from "./card-palette";
import { OG_MONO_FAMILY, OG_SANS_FAMILY } from "./fonts";
import { Glyph, SketchView } from "./synopsis-glyphs";
import type { Synopsis, SynopsisMetric } from "./synopsis-types";
import { OG_CARD } from "./theme";

/* The right-hand card of an artifact preview. Every element with children sets display: flex, as Satori requires. */

const innerWidth = OG_CARD.width - OG_CARD.border * 2 - OG_CARD.padding * 2;
const innerHeight = OG_CARD.height - OG_CARD.border * 2 - OG_CARD.padding * 2;

const column = { display: "flex", flexDirection: "column" } as const;

function Metrics({ metrics, sketchHeight, p }: { metrics: SynopsisMetric[]; sketchHeight: number; p: OgCardPalette }) {
  const valueSize = metrics.length >= 3 ? 34 : sketchHeight > 0 ? 42 : 52;
  return (
    <div style={{ display: "flex", gap: 18, width: innerWidth }}>
      {metrics.map((metric) => (
        <div key={metric.label} style={{ ...column, flex: 1, minWidth: 0, gap: 4 }}>
          <div style={{ display: "flex", fontSize: 16, fontWeight: 500, color: p.muted, whiteSpace: "nowrap", overflow: "hidden" }}>{metric.label}</div>
          <div style={{ display: "flex", fontSize: valueSize, fontWeight: 600, color: p.ink, letterSpacing: -0.02 * valueSize, whiteSpace: "nowrap" }}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function TableView({ header, rows, p }: { header: string[]; rows: string[][]; p: OgCardPalette }) {
  const cell = (text: string, index: number, bold: boolean) => (
    <div key={index} style={{ display: "flex", flex: 1, minWidth: 0, padding: "0 10px", fontSize: 17, fontWeight: bold ? 600 : 500, color: bold ? p.ink : p.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
      {text}
    </div>
  );
  return (
    <div style={{ ...column, width: innerWidth, border: `4px solid ${p.ink}` }}>
      <div style={{ display: "flex", alignItems: "center", height: 44, background: p.blueWash, borderBottom: `4px solid ${p.ink}` }}>{header.map((text, index) => cell(text, index, true))}</div>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: "flex", alignItems: "center", height: 42, borderTop: rowIndex === 0 ? "none" : `2px solid ${p.rule}` }}>
          {row.map((text, index) => cell(text, index, false))}
        </div>
      ))}
    </div>
  );
}

function Chips({ names, p }: { names: string[]; p: OgCardPalette }) {
  return (
    <div style={{ ...column, gap: 16 }}>
      <div style={{ display: "flex", fontSize: 17, fontWeight: 500, color: p.muted }}>Built from</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: innerWidth }}>
        {names.map((name) => (
          <div key={name} style={{ display: "flex", padding: "6px 14px", fontSize: 20, fontWeight: 600, color: p.ink, background: p.blueWash, border: `4px solid ${p.ink}` }}>
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

function Prose({ heading, body, p }: { heading: string | null; body: string; p: OgCardPalette }) {
  return (
    <div style={{ ...column, gap: 12, width: innerWidth }}>
      {heading ? <div style={{ display: "block", fontSize: 27, fontWeight: 600, lineHeight: 1.15, color: p.ink, letterSpacing: -0.5, lineClamp: 2 }}>{heading}</div> : null}
      <div style={{ display: "block", fontSize: 20, fontWeight: 500, lineHeight: 1.4, color: p.muted, lineClamp: heading ? 6 : 8 }}>{body}</div>
    </div>
  );
}

function Code({ language, lines, p }: { language: string; lines: string[]; p: OgCardPalette }) {
  return (
    <div style={{ ...column, gap: 10, width: innerWidth }}>
      <div style={{ display: "flex", fontSize: 15, fontWeight: 600, color: p.blue, letterSpacing: 1.2, textTransform: "uppercase" }}>{language}</div>
      <div style={{ ...column, fontFamily: OG_MONO_FAMILY, fontSize: 17, lineHeight: 1.42, color: p.ink }}>
        {lines.map((line, index) => (
          <div key={index} style={{ display: "flex", whiteSpace: "pre", height: 24 }}>{line || " "}</div>
        ))}
      </div>
    </div>
  );
}

function GlyphCard({ synopsis, p }: { synopsis: Extract<Synopsis, { type: "glyph" }>; p: OgCardPalette }) {
  return (
    <div style={{ ...column, alignItems: "center", justifyContent: "center", gap: 18, width: innerWidth, height: innerHeight }}>
      <Glyph glyph={synopsis.glyph} p={p} />
      <div style={{ ...column, alignItems: "center", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: p.ink, whiteSpace: "nowrap" }}>{synopsis.label}</div>
        {synopsis.detail ? <div style={{ display: "flex", fontSize: 18, fontWeight: 500, color: p.muted }}>{synopsis.detail}</div> : null}
      </div>
    </div>
  );
}

function MetricsCard({ synopsis, p }: { synopsis: Extract<Synopsis, { type: "metrics" }>; p: OgCardPalette }) {
  const sketchHeight = synopsis.sketch ? 104 : 0;
  return (
    <div style={{ ...column, justifyContent: synopsis.sketch ? "space-between" : "center", width: innerWidth, height: innerHeight }}>
      <Metrics metrics={synopsis.metrics} sketchHeight={sketchHeight} p={p} />
      {synopsis.sketch ? <SketchView sketch={synopsis.sketch} width={innerWidth} height={sketchHeight} p={p} /> : null}
    </div>
  );
}

function ChartCard({ synopsis, p }: { synopsis: Extract<Synopsis, { type: "chart" }>; p: OgCardPalette }) {
  const titleHeight = synopsis.title ? 34 : 0;
  return (
    <div style={{ ...column, justifyContent: "space-between", width: innerWidth, height: innerHeight }}>
      {synopsis.title ? <div style={{ display: "flex", height: titleHeight, fontSize: 22, fontWeight: 600, color: p.ink, whiteSpace: "nowrap", overflow: "hidden" }}>{synopsis.title}</div> : null}
      <SketchView sketch={synopsis.sketch} width={innerWidth} height={innerHeight - titleHeight - 12} p={p} />
    </div>
  );
}

function cardBody(synopsis: Synopsis, p: OgCardPalette): ReactNode {
  switch (synopsis.type) {
    case "metrics":
      return <MetricsCard synopsis={synopsis} p={p} />;
    case "chart":
      return <ChartCard synopsis={synopsis} p={p} />;
    case "table":
      return <TableView header={synopsis.header} rows={synopsis.rows} p={p} />;
    case "components":
      return <Chips names={synopsis.names} p={p} />;
    case "prose":
      return <Prose heading={synopsis.heading} body={synopsis.body} p={p} />;
    case "code":
      return <Code language={synopsis.language} lines={synopsis.lines} p={p} />;
    case "glyph":
      return <GlyphCard synopsis={synopsis} p={p} />;
  }
}

/** The pixel card on the right of an artifact preview, holding its synopsis, in the site's colors or the artifact's theme. */
export function SynopsisCard({ synopsis, palette = siteCardPalette }: { synopsis: Synopsis; palette?: OgCardPalette }) {
  const p = palette;
  return (
    <div
      style={{
        position: "absolute",
        left: OG_CARD.left,
        top: OG_CARD.top,
        width: OG_CARD.width,
        height: OG_CARD.height,
        display: "flex",
        padding: OG_CARD.padding,
        overflow: "hidden",
        background: p.paper,
        border: `${String(OG_CARD.border)}px solid ${p.ink}`,
        boxShadow: `${String(OG_CARD.shadow)}px ${String(OG_CARD.shadow)}px 0 0 ${p.shadowColor}`,
        fontFamily: OG_SANS_FAMILY,
      }}
    >
      {cardBody(synopsis, p)}
    </div>
  );
}
