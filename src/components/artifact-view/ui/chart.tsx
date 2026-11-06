"use client";

import { niceScale, visibleLabelIndexes, type ChartScale } from "@/lib/ui/chart-scale";
import { stackSeries, type StackLayout } from "@/lib/ui/chart-stack";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { Bars, Lines, plotSize, StackedAreas, StackedBars, type Series } from "./chart-marks";
import { AxisTitle, ChartFrame, ChartTable, chartHeights, Gridlines, Legend, makeFormatter, XAxisLabels, TooltipBox, TooltipRow, usePointer, YAxis, type Formatter } from "./chart-parts";
import { PieChart } from "./chart-pie";
import { ScatterChart } from "./chart-scatter";
import type { ViewProps } from "./stout";

type ChartProps = UiProps<"Chart">;
type Mark = "bar" | "line" | "area";

interface PlotData {
  mark: Mark;
  labels: string[];
  series: Series[];
  /** Present when series are stacked. */
  stack: StackLayout | null;
  scale: ChartScale;
}

function Marks({ data }: { data: PlotData }) {
  const count = data.labels.length;
  if (data.stack) {
    return data.mark === "bar"
      ? <StackedBars segments={data.stack.segments} count={count} scale={data.scale} />
      : <StackedAreas segments={data.stack.segments} count={count} scale={data.scale} />;
  }
  if (data.mark === "bar") return <Bars series={data.series} count={count} scale={data.scale} />;
  return <Lines series={data.series} count={count} scale={data.scale} area={data.mark === "area"} />;
}

function Tooltip({ data, index, format }: { data: PlotData; index: number; format: Formatter }) {
  const total = data.stack?.totals[index];
  return (
    <TooltipBox left={((index + 0.5) / data.labels.length) * 100}>
      <p className="truncate font-medium">{data.labels[index] ?? ""}</p>
      {data.series.map((item, seriesIndex) => <TooltipRow key={item.name + String(seriesIndex)} colorIndex={seriesIndex} name={item.name} value={format(item.values[index])} />)}
      {total === undefined ? null : <TooltipRow colorIndex={null} name="Total" value={format(total)} />}
    </TooltipBox>
  );
}

function labelSet(labels: string[], limit: number) {
  const count = labels.length;
  const shown = visibleLabelIndexes(count, limit);
  return {
    anchor: shown.length === count ? ("center" as const) : ("spread" as const),
    items: shown.map((index) => ({ key: index, position: (index + 0.5) / count, text: labels[index] ?? "" })),
  };
}

function XAxis({ labels }: { labels: string[] }) {
  return <XAxisLabels wide={labelSet(labels, 8)} narrow={labelSet(labels, 4)} />;
}

interface Formats {
  /** Values in tooltips and the table, sharing one decimal count. */
  value: Formatter;
  /** Axis ticks, sharing their own decimal count. */
  tick: Formatter;
}

function Plot({ data, formats, heightClass, summary }: { data: PlotData; formats: Formats; heightClass: string; summary: string }) {
  const pointer = usePointer(data.labels.length);
  const format = formats.value;
  return (
    <div className="flex min-w-0">
      <YAxis scale={data.scale} format={formats.tick} heightClass={heightClass} />
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
          <Gridlines scale={data.scale} />
          <svg viewBox={`0 0 ${String(plotSize)} ${String(plotSize)}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <Marks data={data} />
          </svg>
          <div className="absolute inset-0 flex" aria-hidden>
            {data.labels.map((label, index) => (
              <div key={`${label}-${String(index)}`} className={cn("h-full flex-1", pointer.active === index && "bg-foreground/5")} onMouseEnter={() => { pointer.setActive(index); }} />
            ))}
          </div>
          {pointer.active !== null ? <Tooltip data={data} index={pointer.active} format={format} /> : null}
        </div>
        <XAxis labels={data.labels} />
      </div>
    </div>
  );
}

function chartSummary(type: string, props: ChartProps, seriesCount: number, labelCount: number) {
  const about = props.title ? ` of ${props.title}` : "";
  const stacked = props.stacked ? "Stacked " : "";
  return `${stacked}${type} chart${about}: ${String(seriesCount)} series over ${String(labelCount)} labels. Use the left and right arrow keys to read values.`;
}

function hasData(labels: string[], series: Series[]) {
  return labels.length > 0 && series.some((item) => item.values.some((value) => value !== null));
}

function plotData(props: ChartProps, mark: Mark): PlotData {
  const labels = props.labels ?? [];
  const series: Series[] = props.series.map((item) => ({ name: item.name, values: labels.map((_, index) => item.values?.[index] ?? null) }));
  // One label cannot draw a band, so a single stacked area shows as a stacked bar.
  const drawn: Mark = mark === "area" && props.stacked === true && labels.length < 2 ? "bar" : mark;
  const stack = props.stacked === true && mark !== "line" ? stackSeries(series.map((item) => item.values), labels.length) : null;
  const scale = niceScale(stack ? stack.extent : series.flatMap((item) => item.values));
  return { mark: drawn, labels, series, stack, scale };
}

function tableRows(data: PlotData, format: Formatter) {
  return data.labels.map((label, index) => ({
    key: `${label}-${String(index)}`,
    cells: [label, ...data.series.map((item) => format(item.values[index])), ...(data.stack ? [format(data.stack.totals[index])] : [])],
  }));
}

function CartesianChart({ props, mark }: { props: ChartProps; mark: Mark }) {
  const data = plotData(props, mark);
  const numberFormat = props.format ?? "number";
  const currency = props.currency ?? "USD";
  const format = makeFormatter(numberFormat, currency, [...data.series.flatMap((item) => item.values), ...(data.stack?.totals ?? [])]);
  const formats: Formats = { value: format, tick: makeFormatter(numberFormat, currency, data.scale.ticks) };
  const heightClass = chartHeights[props.height ?? "md"];
  const head = [props.xLabel ?? "Label", ...data.series.map((item) => item.name), ...(data.stack ? ["Total"] : [])];
  return (
    <ChartFrame
      title={props.title}
      legend={<Legend names={data.series.map((item) => item.name)} />}
      empty={!hasData(data.labels, data.series)}
      heightClass={heightClass}
      table={(visible) => <ChartTable head={head} rows={tableRows(data, format)} visible={visible} />}
    >
      <div className="min-w-0 space-y-1">
        {/* Room for the top tick label, which centers on the plot edge. */}
        <AxisTitle text={props.yLabel} className="pb-1.5" />
        <Plot data={data} formats={formats} heightClass={heightClass} summary={chartSummary(mark, props, data.series.length, data.labels.length)} />
        <AxisTitle text={props.xLabel} className="text-center" />
      </div>
    </ChartFrame>
  );
}

/** Chart: bar, line, area (optionally stacked), pie, donut, or scatter. */
export function ChartView({ props }: ViewProps<"Chart">) {
  if (props.type === "pie" || props.type === "donut") return <PieChart props={props} donut={props.type === "donut"} />;
  if (props.type === "scatter") return <ScatterChart props={props} />;
  return <CartesianChart props={props} mark={props.type} />;
}
