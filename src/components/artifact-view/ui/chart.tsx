"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { niceScale, scalePosition, visibleLabelIndexes, type ChartScale } from "@/lib/ui/chart-scale";
import { formatNumber, missingValue } from "@/lib/ui/number-format";
import type { NumberFormat } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { Bars, Lines, plotSize, seriesBg, type Series } from "./chart-marks";
import type { ViewProps } from "./stout";

const heights = { sm: "h-40", md: "h-60", lg: "h-80" } as const;

type Formatter = (value: number | null | undefined) => string;

function makeFormatter(format: NumberFormat, currency: string): Formatter {
  return (value) => (value === null || value === undefined ? missingValue : formatNumber(value, format, currency));
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((item, index) => (
        <li key={item.name + String(index)} className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", seriesBg[index % seriesBg.length])} />
          <span className="max-w-[20ch] truncate">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

function YAxis({ scale, format, heightClass }: { scale: ChartScale; format: Formatter; heightClass: string }) {
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

function Gridlines({ scale }: { scale: ChartScale }) {
  return scale.ticks.map((tick) => (
    <div
      key={tick}
      aria-hidden
      className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-foreground/25" : "border-border/70 border-dashed")}
      style={{ top: `${String((1 - scalePosition(tick, scale)) * 100)}%` }}
    />
  ));
}

function Tooltip({ label, series, index, count, format }: { label: string; series: Series[]; index: number; count: number; format: Formatter }) {
  const left = ((index + 0.5) / count) * 100;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 w-max max-w-[14rem] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
      style={left > 60 ? { right: `${String(100 - left)}%`, marginRight: 8 } : { left: `${String(left)}%`, marginLeft: 8 }}
    >
      <p className="truncate font-medium">{label}</p>
      {series.map((item, seriesIndex) => (
        <p key={item.name + String(seriesIndex)} className="flex items-center gap-1.5 tabular-nums">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", seriesBg[seriesIndex % seriesBg.length])} />
          <span className="min-w-0 truncate text-muted-foreground">{item.name}</span>
          <span className="ml-auto pl-2">{format(item.values[index])}</span>
        </p>
      ))}
    </div>
  );
}

function DataTable({ labels, series, format, visible }: { labels: string[]; series: Series[]; format: Formatter; visible: boolean }) {
  return (
    <div className={visible ? "max-h-72 overflow-auto rounded-md border" : "sr-only"}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr>
            <th scope="col" className="border-b px-3 py-1.5 text-left font-medium text-muted-foreground">Label</th>
            {series.map((item, index) => <th key={item.name + String(index)} scope="col" className="border-b px-3 py-1.5 text-right font-medium text-muted-foreground">{item.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={`${label}-${String(index)}`} className="border-b last:border-b-0">
              <th scope="row" className="px-3 py-1 text-left font-normal">{label}</th>
              {series.map((item, seriesIndex) => <td key={item.name + String(seriesIndex)} className="px-3 py-1 text-right tabular-nums">{format(item.values[index])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function usePointer(count: number) {
  const [active, setActive] = useState<number | null>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setActive((current) => Math.min(count - 1, Math.max(0, (current ?? (step > 0 ? -1 : count)) + step)));
  }
  return { active, setActive, onKeyDown };
}

interface PlotProps {
  type: "bar" | "line" | "area";
  labels: string[];
  series: Series[];
  scale: ChartScale;
  format: Formatter;
  heightClass: string;
  summary: string;
}

function Plot({ type, labels, series, scale, format, heightClass, summary }: PlotProps) {
  const count = labels.length;
  const pointer = usePointer(count);
  return (
    <div className="flex min-w-0">
      <YAxis scale={scale} format={format} heightClass={heightClass} />
      <div className="min-w-0 flex-1">
        <div
          tabIndex={0}
          role="img"
          aria-label={summary}
          onKeyDown={pointer.onKeyDown}
          onMouseLeave={() => { pointer.setActive(null); }}
          onBlur={() => { pointer.setActive(null); }}
          className={cn("relative rounded-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", heightClass)}
        >
          <Gridlines scale={scale} />
          <svg viewBox={`0 0 ${String(plotSize)} ${String(plotSize)}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {type === "bar" ? <Bars series={series} count={count} scale={scale} /> : <Lines series={series} count={count} scale={scale} area={type === "area"} />}
          </svg>
          <div className="absolute inset-0 flex" aria-hidden>
            {labels.map((label, index) => (
              <div key={`${label}-${String(index)}`} className={cn("h-full flex-1", pointer.active === index && "bg-foreground/5")} onMouseEnter={() => { pointer.setActive(index); }} />
            ))}
          </div>
          {pointer.active !== null ? <Tooltip label={labels[pointer.active] ?? ""} series={series} index={pointer.active} count={count} format={format} /> : null}
        </div>
        <XAxis labels={labels} />
      </div>
    </div>
  );
}

function XAxis({ labels }: { labels: string[] }) {
  const count = labels.length;
  return (
    <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
      {visibleLabelIndexes(count, 8).map((index) => (
        <span key={index} className="absolute max-w-20 -translate-x-1/2 truncate" style={{ left: `${String(((index + 0.5) / count) * 100)}%` }}>
          {labels[index]}
        </span>
      ))}
    </div>
  );
}

function chartSummary(type: string, title: string | undefined, seriesCount: number, labelCount: number) {
  const about = title ? ` of ${title}` : "";
  return `${type} chart${about}: ${String(seriesCount)} series over ${String(labelCount)} labels. Use the left and right arrow keys to read values.`;
}

function ChartHeader({ title, titleId, series, empty, showTable, onToggle }: { title: string | undefined; titleId: string; series: Series[]; empty: boolean; showTable: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {title ? <figcaption id={titleId} className="min-w-0 text-sm font-medium break-words">{title}</figcaption> : null}
      <Legend series={series} />
      {empty ? null : <Button variant="ghost" size="xs" className="ml-auto text-xs" aria-pressed={showTable} onClick={onToggle}>{showTable ? "Chart" : "Table"}</Button>}
    </div>
  );
}

function hasData(labels: string[], series: Series[]) {
  return labels.length > 0 && series.some((item) => item.values.some((value) => value !== null));
}

export function ChartView({ props }: ViewProps<"Chart">) {
  const titleId = useId();
  const [showTable, setShowTable] = useState(false);
  const series: Series[] = props.series.map((item) => ({ name: item.name, values: props.labels.map((_, index) => item.values[index] ?? null) }));
  const format = makeFormatter(props.format ?? "number", props.currency ?? "USD");
  const heightClass = heights[props.height ?? "md"];
  const empty = !hasData(props.labels, series);
  const header = <ChartHeader title={props.title} titleId={titleId} series={series} empty={empty} showTable={showTable} onToggle={() => { setShowTable((value) => !value); }} />;
  if (empty) {
    return (
      <figure className="min-w-0 space-y-3" aria-labelledby={props.title ? titleId : undefined}>
        {header}
        <div className={cn("flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground", heightClass)}>No data to chart yet.</div>
      </figure>
    );
  }
  return (
    <figure className="min-w-0 space-y-3" aria-labelledby={props.title ? titleId : undefined}>
      {header}
      {showTable ? null : (
        <Plot
          type={props.type}
          labels={props.labels}
          series={series}
          scale={niceScale(series.flatMap((item) => item.values))}
          format={format}
          heightClass={heightClass}
          summary={chartSummary(props.type, props.title, series.length, props.labels.length)}
        />
      )}
      <DataTable labels={props.labels} series={series} format={format} visible={showTable} />
    </figure>
  );
}
