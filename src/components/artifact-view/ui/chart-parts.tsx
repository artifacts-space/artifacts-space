"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { scalePosition, tickLabelWidth, type ChartScale } from "@/lib/ui/chart-scale";
import { formatNumber, missingValue } from "@/lib/ui/number-format";
import type { NumberFormat } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { seriesBg } from "./chart-marks";

/** Plot heights, shared by every chart type. */
export const chartHeights = { sm: "h-40", md: "h-60", lg: "h-80" } as const;
export type ChartHeight = keyof typeof chartHeights;

export type Formatter = (value: number | null | undefined) => string;

/** Formats chart values; missing values show a dash. */
export function makeFormatter(format: NumberFormat, currency: string): Formatter {
  return (value) => (value === null || value === undefined ? missingValue : formatNumber(value, format, currency));
}

/** The background class for color slot `index`. */
export function swatch(index: number): string {
  return seriesBg[index % seriesBg.length] ?? "bg-series-1";
}

/** Series names with color swatches. Hidden for a single series: the title names it. */
export function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {names.map((name, index) => (
        <li key={name + String(index)} className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", swatch(index))} />
          <span className="max-w-[20ch] truncate">{name}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tick labels for a value axis, placed beside the plot. */
export function YAxis({ scale, format, heightClass }: { scale: ChartScale; format: Formatter; heightClass: string }) {
  const labels = scale.ticks.map((tick) => ({ tick, text: format(tick) }));
  const longest = labels.reduce((width, label) => Math.max(width, label.text.length), 1);
  return (
    <div aria-hidden className={cn("relative shrink-0 self-start text-right text-[11px] text-muted-foreground tabular-nums", heightClass)} style={{ width: `${String(Math.min(longest, 10) + 1.5)}ch` }}>
      {labels.map(({ tick, text }) => (
        <span key={tick} className="absolute right-2 block max-w-full -translate-y-1/2 truncate" style={{ top: `${String((1 - scalePosition(tick, scale)) * 100)}%` }}>
          {text}
        </span>
      ))}
    </div>
  );
}

/** Horizontal gridlines at each tick; the zero line is stronger. */
export function Gridlines({ scale }: { scale: ChartScale }) {
  return scale.ticks.map((tick) => (
    <div
      key={tick}
      aria-hidden
      className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-foreground/25" : "border-border/70 border-dashed")}
      style={{ top: `${String((1 - scalePosition(tick, scale)) * 100)}%` }}
    />
  ));
}

/** A floating readout inside the plot, kept on the side away from the edge. `left` is a percentage. */
export function TooltipBox({ left, children }: { left: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 w-max max-w-[14rem] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
      style={left > 60 ? { right: `${String(100 - left)}%`, marginRight: 8 } : { left: `${String(left)}%`, marginLeft: 8 }}
    >
      {children}
    </div>
  );
}

/** One row of a tooltip: a swatch, a name, and a value. */
export function TooltipRow({ colorIndex, name, value }: { colorIndex: number | null; name: string; value: string }) {
  return (
    <p className="flex items-center gap-1.5 tabular-nums">
      {colorIndex === null ? <span aria-hidden className="size-2 shrink-0" /> : <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", swatch(colorIndex))} />}
      <span className="min-w-0 truncate text-muted-foreground">{name}</span>
      <span className="ml-auto pl-2">{value}</span>
    </p>
  );
}

/** Arrow-key and hover state for reading one item at a time. */
export function usePointer(count: number) {
  const [active, setActive] = useState<number | null>(null);
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (count === 0) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setActive((current) => Math.min(count - 1, Math.max(0, (current ?? (step > 0 ? -1 : count)) + step)));
  }
  return { active: active !== null && active < count ? active : null, setActive, onKeyDown };
}

interface TableProps {
  head: string[];
  rows: { key: string; cells: string[] }[];
  visible: boolean;
  /** How many leading columns hold text (left-aligned). The first is the row header. Default 1. */
  textColumns?: number;
}

/** The data table behind a chart: hidden for screen readers until shown. */
export function ChartTable({ head, rows, visible, textColumns = 1 }: TableProps) {
  return (
    <div className={visible ? "max-h-72 overflow-auto rounded-md border" : "sr-only"}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr>
            {head.map((name, index) => <th key={name + String(index)} scope="col" className={cn("border-b px-3 py-1.5 font-medium text-muted-foreground", index < textColumns ? "text-left" : "text-right")}>{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-b-0">
              {row.cells.map((cell, index) => index === 0
                ? <th key={index} scope="row" className="px-3 py-1 text-left font-normal break-words">{cell}</th>
                : <td key={index} className={cn("px-3 py-1", index < textColumns ? "text-left break-words" : "text-right tabular-nums")}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FrameProps {
  title: string | undefined;
  legend: ReactNode;
  empty: boolean;
  heightClass: string;
  /** The data table, given whether it is shown. It always renders, for screen readers. */
  table: (visible: boolean) => ReactNode;
  children: ReactNode;
}

/** The figure around every chart: title, legend, a Chart/Table toggle, and an empty state. */
export function ChartFrame({ title, legend, empty, heightClass, table, children }: FrameProps) {
  const titleId = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="min-w-0 space-y-3" aria-labelledby={title ? titleId : undefined}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {title ? <figcaption id={titleId} className="min-w-0 text-sm font-medium break-words">{title}</figcaption> : null}
        {legend}
        {empty ? null : <Button variant="ghost" size="xs" className="ml-auto text-xs" aria-pressed={showTable} onClick={() => { setShowTable((value) => !value); }}>{showTable ? "Chart" : "Table"}</Button>}
      </div>
      {empty ? (
        <div className={cn("flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground", heightClass)}>No data to chart yet.</div>
      ) : (
        <>
          {showTable ? null : children}
          {table(showTable)}
        </>
      )}
    </figure>
  );
}

/** A short axis name, shown above the value axis or below the x-axis. */
export function AxisTitle({ text, className }: { text: string | undefined; className?: string }) {
  if (!text) return null;
  return <p className={cn("truncate text-[11px] text-muted-foreground", className)}>{text}</p>;
}

/** X-axis labels at `positions` (0 to 1). Each label gets a width that cannot overlap its neighbors. */
function TickLabels({ items, anchor }: { items: { key: string | number; position: number; text: string }[]; anchor: "center" | "spread" }) {
  const width = tickLabelWidth(items.map((item) => item.position), anchor);
  return items.map((item) => {
    // Spread labels slide by their position: left-aligned at 0, right-aligned at 1, so edge labels stay inside the plot.
    const shift = anchor === "center" ? 50 : item.position * 100;
    return (
      <span key={item.key} className="absolute truncate" style={{ maxWidth: `min(5rem, ${String(width * 100)}%)`, left: `${String(item.position * 100)}%`, transform: `translateX(-${String(shift)}%)` }}>
        {item.text}
      </span>
    );
  });
}

type TickSet = Parameters<typeof TickLabels>[0];

/**
 * The x-axis label row. Plots narrower than 24rem (phones, narrow grid
 * columns) show the `narrow` set, with fewer labels, so each stays readable.
 */
export function XAxisLabels({ wide, narrow, className }: { wide: TickSet; narrow: TickSet; className?: string }) {
  return (
    <div aria-hidden className={cn("@container relative mt-1.5 h-4 text-[11px] text-muted-foreground", className)}>
      <div className="absolute inset-0 hidden @sm:block"><TickLabels {...wide} /></div>
      <div className="absolute inset-0 @sm:hidden"><TickLabels {...narrow} /></div>
    </div>
  );
}
