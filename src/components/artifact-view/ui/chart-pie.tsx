"use client";

import { foldPieEntries, pieSlices, slicePath, type PieSlice } from "@/lib/ui/chart-pie";
import type { UiProps } from "@/lib/ui/catalog";
import { formatNumber } from "@/lib/ui/number-format";
import { cn } from "@/lib/utils";

import { seriesFill } from "./chart-marks";
import { ChartFrame, ChartTable, chartHeights, makeFormatter, swatch, usePointer, type Formatter } from "./chart-parts";

/** The pie is drawn in a 200 × 200 box. */
const center = 100;
const outerRadius = 98;
const holeRadius = 60;

/** The pie's largest width for each chart height. */
const pieWidths = { sm: "max-w-40", md: "max-w-56", lg: "max-w-72" } as const;

/** "Other" is neutral gray, so it never reads as one more category. */
function sliceFill(slice: PieSlice, index: number): string {
  return slice.index === -1 ? "fill-muted-foreground/60" : (seriesFill[index % seriesFill.length] ?? "fill-series-1");
}

function sliceSwatch(slice: PieSlice, index: number): string {
  return slice.index === -1 ? "bg-muted-foreground/60" : swatch(index);
}

function percent(fraction: number): string {
  return `${formatNumber(Math.round(fraction * 1000) / 10)}%`;
}

function SliceList({ slices, active, format, onHover }: { slices: PieSlice[]; active: number | null; format: Formatter; onHover: (index: number | null) => void }) {
  return (
    <ul className="w-full min-w-0 space-y-0.5 text-xs sm:max-w-80" onMouseLeave={() => { onHover(null); }}>
      {slices.map((slice, index) => (
        <li
          key={`${slice.label}-${String(slice.index)}`}
          className={cn("flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1", active === index && "bg-muted")}
          onMouseEnter={() => { onHover(index); }}
        >
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", sliceSwatch(slice, index))} />
          <span className="min-w-0 flex-1 truncate" title={slice.label}>{slice.label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{format(slice.value)}</span>
          <span className="w-12 shrink-0 text-right tabular-nums">{percent(slice.fraction)}</span>
        </li>
      ))}
    </ul>
  );
}

function DonutCenter({ slice, total, format }: { slice: PieSlice | undefined; total: number; format: Formatter }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-[22%] flex flex-col items-center justify-center text-center">
      <span className="max-w-full truncate text-[11px] text-muted-foreground">{slice ? slice.label : "Total"}</span>
      <span className="max-w-full truncate text-sm font-medium tabular-nums">{format(slice ? slice.value : total)}</span>
      {slice ? <span className="text-[11px] text-muted-foreground tabular-nums">{percent(slice.fraction)}</span> : null}
    </div>
  );
}

function Slices({ slices, active, donut, onHover }: { slices: PieSlice[]; active: number | null; donut: boolean; onHover: (index: number) => void }) {
  return (
    <svg viewBox={`0 0 ${String(center * 2)} ${String(center * 2)}`} className="size-full" aria-hidden>
      {slices.map((slice, index) => slice.fraction > 0 ? (
        <path
          key={`${slice.label}-${String(slice.index)}`}
          d={slicePath(slice, center, outerRadius, donut ? holeRadius : 0)}
          fillRule="evenodd"
          className={cn(sliceFill(slice, index), "stroke-background transition-opacity motion-reduce:transition-none", active !== null && active !== index && "opacity-40")}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          onMouseEnter={() => { onHover(index); }}
        />
      ) : null)}
    </svg>
  );
}

function summaryText(props: UiProps<"Chart">, slices: PieSlice[], format: Formatter): string {
  const about = props.title ? ` of ${props.title}` : "";
  const parts = slices.map((slice) => `${slice.label} ${format(slice.value)} (${percent(slice.fraction)})`).join(", ");
  return `${props.type} chart${about}: ${parts}. Use the arrow keys to read each slice.`;
}

/** Pie and donut charts: one series, one slice per label, a legend with values and shares. */
export function PieChart({ props, donut }: { props: UiProps<"Chart">; donut: boolean }) {
  const labels = props.labels ?? [];
  const values = props.series[0]?.values ?? [];
  const slices = pieSlices(foldPieEntries(labels, values));
  const allSlices = pieSlices(foldPieEntries(labels, values, Infinity));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const format = makeFormatter(props.format ?? "number", props.currency ?? "USD");
  const pointer = usePointer(slices.length);
  const activeSlice = pointer.active === null ? undefined : slices[pointer.active];
  const height = props.height ?? "md";
  return (
    <ChartFrame
      title={props.title}
      legend={null}
      empty={!slices.some((slice) => slice.fraction > 0)}
      heightClass={chartHeights[height]}
      table={(visible) => <ChartTable head={[props.xLabel ?? "Label", props.series[0]?.name ?? "Value", "Share"]} rows={allSlices.map((slice) => ({ key: `${slice.label}-${String(slice.index)}`, cells: [slice.label, format(slice.value), percent(slice.fraction)] }))} visible={visible} />}
    >
      <div className="@container min-w-0">
        <div className="flex min-w-0 flex-col items-center gap-x-8 gap-y-4 @md:flex-row">
          <div
            tabIndex={0}
            role="img"
            aria-label={summaryText(props, slices, format)}
            onKeyDown={pointer.onKeyDown}
            onMouseLeave={() => { pointer.setActive(null); }}
            onBlur={() => { pointer.setActive(null); }}
            className={cn("relative aspect-square w-full shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", pieWidths[height])}
          >
            <Slices slices={slices} active={pointer.active} donut={donut} onHover={pointer.setActive} />
            {donut ? <DonutCenter slice={activeSlice} total={total} format={format} /> : null}
          </div>
          <SliceList slices={slices} active={pointer.active} format={format} onHover={pointer.setActive} />
          <p role="status" className="sr-only">{activeSlice ? `${activeSlice.label}: ${format(activeSlice.value)}, ${percent(activeSlice.fraction)}` : ""}</p>
        </div>
      </div>
    </ChartFrame>
  );
}
