"use client";

import type { MouseEvent } from "react";

import { flattenPoints, nearestIndex, type PlotPoint } from "@/lib/ui/chart-points";
import { niceScale, scalePosition, type ChartScale } from "@/lib/ui/chart-scale";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { plotSize, plotY, seriesStroke } from "./chart-marks";
import { AxisTitle, ChartFrame, ChartTable, chartHeights, Gridlines, Legend, makeFormatter, XAxisLabels, TooltipBox, TooltipRow, usePointer, YAxis, type Formatter } from "./chart-parts";

type ChartProps = UiProps<"Chart">;

interface ScatterData {
  points: PlotPoint[];
  names: string[];
  x: ChartScale;
  y: ChartScale;
}

function plotX(value: number, scale: ChartScale): number {
  return scalePosition(value, scale) * plotSize;
}

/**
 * Each point is a zero-length line with a round cap: it stays a circle while
 * the plot stretches. A wider surface-colored line behind it rings the dot.
 */
function Dots({ data, active }: { data: ScatterData; active: number | null }) {
  return data.points.map((point, index) => {
    const x = plotX(point.x, data.x);
    const y = plotY(point.y, data.y);
    const size = active === index ? 13 : 8;
    return (
      <g key={index}>
        <line x1={x} x2={x} y1={y} y2={y} className="stroke-background" strokeWidth={size + 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={x} x2={x} y1={y} y2={y} className={seriesStroke[point.series % seriesStroke.length]} strokeWidth={size} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
    );
  });
}

function XTicks({ scale, format }: { scale: ChartScale; format: Formatter }) {
  const items = scale.ticks.map((tick) => ({ key: tick, position: scalePosition(tick, scale), text: format(tick) }));
  return <XAxisLabels className="tabular-nums" wide={{ anchor: "spread", items }} narrow={{ anchor: "spread", items: items.filter((_, index) => index % 2 === 0) }} />;
}

function VerticalGridlines({ scale }: { scale: ChartScale }) {
  return scale.ticks.map((tick) => (
    <div key={tick} aria-hidden className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: `${String(scalePosition(tick, scale) * 100)}%` }} />
  ));
}

interface Formats {
  /** Point values in tooltips and the table. */
  x: Formatter;
  y: Formatter;
  /** Axis ticks, each axis sharing its own decimal count. */
  xTick: Formatter;
  yTick: Formatter;
}

function PointTooltip({ data, index, props, formats }: { data: ScatterData; index: number; props: ChartProps; formats: Formats }) {
  const point = data.points[index];
  if (!point) return null;
  return (
    <TooltipBox left={scalePosition(point.x, data.x) * 100}>
      <p className="truncate font-medium">{point.label ?? data.names[point.series] ?? ""}</p>
      {point.label ? <TooltipRow colorIndex={point.series} name={data.names[point.series] ?? ""} value="" /> : null}
      <TooltipRow colorIndex={null} name={props.xLabel ?? "x"} value={formats.x(point.x)} />
      <TooltipRow colorIndex={null} name={props.yLabel ?? "y"} value={formats.y(point.y)} />
    </TooltipBox>
  );
}

function hoverIndex(event: MouseEvent<HTMLDivElement>, data: ScatterData): number {
  const box = event.currentTarget.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return -1;
  const positions = data.points.map((point): [number, number] => [scalePosition(point.x, data.x) * box.width, (1 - scalePosition(point.y, data.y)) * box.height]);
  return nearestIndex(positions, event.clientX - box.left, event.clientY - box.top);
}

function summaryText(props: ChartProps, data: ScatterData) {
  const about = props.title ? ` of ${props.title}` : "";
  return `Scatter chart${about}: ${String(data.points.length)} points in ${String(data.names.length)} series. Use the arrow keys to read points from left to right.`;
}

function Plot({ data, props, formats, heightClass }: { data: ScatterData; props: ChartProps; formats: Formats; heightClass: string }) {
  const pointer = usePointer(data.points.length);
  return (
    <div className="flex min-w-0">
      <YAxis scale={data.y} format={formats.yTick} heightClass={heightClass} />
      <div className="min-w-0 flex-1">
        <div
          tabIndex={0}
          role="img"
          aria-label={summaryText(props, data)}
          onKeyDown={pointer.onKeyDown}
          onMouseMove={(event) => { const index = hoverIndex(event, data); pointer.setActive(index === -1 ? null : index); }}
          onMouseLeave={() => { pointer.setActive(null); }}
          onBlur={() => { pointer.setActive(null); }}
          className={cn("relative rounded-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", heightClass)}
        >
          <Gridlines scale={data.y} />
          <VerticalGridlines scale={data.x} />
          <svg viewBox={`0 0 ${String(plotSize)} ${String(plotSize)}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <Dots data={data} active={pointer.active} />
          </svg>
          {pointer.active !== null ? <PointTooltip data={data} index={pointer.active} props={props} formats={formats} /> : null}
        </div>
        <XTicks scale={data.x} format={formats.xTick} />
      </div>
    </div>
  );
}

function scatterData(props: ChartProps): ScatterData {
  const series = props.series.map((item) => ({ points: item.points ?? [] }));
  const points = flattenPoints(series);
  return {
    points,
    names: props.series.map((item) => item.name),
    x: niceScale(points.map((point) => point.x), 4, { includeZero: false }),
    y: niceScale(points.map((point) => point.y), 4, { includeZero: false }),
  };
}

/** Scatter chart: each series is a set of (x, y) points on two numeric axes. */
export function ScatterChart({ props }: { props: ChartProps }) {
  const data = scatterData(props);
  const currency = props.currency ?? "USD";
  const xFormat = props.xFormat ?? "number";
  const yFormat = props.format ?? "number";
  const formats: Formats = {
    x: makeFormatter(xFormat, currency, data.points.map((point) => point.x)),
    y: makeFormatter(yFormat, currency, data.points.map((point) => point.y)),
    xTick: makeFormatter(xFormat, currency, data.x.ticks),
    yTick: makeFormatter(yFormat, currency, data.y.ticks),
  };
  const heightClass = chartHeights[props.height ?? "md"];
  const rows = data.points.map((point, index) => ({ key: String(index), cells: [data.names[point.series] ?? "", point.label ?? "", formats.x(point.x), formats.y(point.y)] }));
  return (
    <ChartFrame
      title={props.title}
      legend={<Legend names={data.names} />}
      empty={data.points.length === 0}
      heightClass={heightClass}
      table={(visible) => <ChartTable head={["Series", "Label", props.xLabel ?? "x", props.yLabel ?? "y"]} rows={rows} visible={visible} textColumns={2} />}
    >
      <div className="min-w-0 space-y-1">
        {/* Room for the top tick label, which centers on the plot edge. */}
        <AxisTitle text={props.yLabel} className="pb-1.5" />
        <Plot data={data} props={props} formats={formats} heightClass={heightClass} />
        <AxisTitle text={props.xLabel} className="text-center" />
      </div>
    </ChartFrame>
  );
}
