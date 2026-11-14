"use client";

import { IconArrowDownRight, IconArrowUpRight, IconCheck, IconMinus } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";

import { MermaidView } from "@/components/artifact-view/mermaid-view";
import { scrollStopProps } from "@/components/code/scroll-stop";
import { useScrollable } from "@/components/code/use-scrollable";
import { Button } from "@/components/ui/button";
import { formatCellValue, formatNumber, missingValue, sharedFractionDigits } from "@/lib/ui/number-format";
import type { CellFormat } from "@/lib/ui/props/shared";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";
import type { ViewProps } from "./stout";

/** Rows shown before "Show all". */
const initialRows = 100;

function isNumeric(format: CellFormat | undefined) {
  return format !== undefined && format !== "text";
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

type TableProps = UiProps<"Table">;

/** Each numeric column's shared decimal count, from every row (shown or not), so the numbers line up and do not shift on "Show all". */
function columnDigits(props: TableProps, currency: string): Map<string, number> {
  const digits = new Map<string, number>();
  for (const column of props.columns) {
    const format = column.format;
    if (format === undefined || format === "text") continue;
    const values = props.rows.map((row) => row[column.key]).filter((value): value is number => typeof value === "number");
    digits.set(column.key, sharedFractionDigits(values, format, currency));
  }
  return digits;
}

/**
 * A table in a figure, captioned by its figcaption. Its frame scrolls when
 * the table is taller or wider than it; only then is the frame a tab stop,
 * a group named by the caption (scroll-stop.ts), so two tables with one
 * caption never make two landmarks with one name.
 */
export function TableView({ props }: ViewProps<"Table">) {
  const [expanded, setExpanded] = useState(false);
  const captionId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(frame);
  const rows = expanded ? props.rows : props.rows.slice(0, initialRows);
  const currency = props.currency ?? "USD";
  const digits = columnDigits(props, currency);
  return (
    <figure className="min-w-0 space-y-2">
      {props.caption ? <figcaption id={captionId} className="text-md font-medium break-words">{props.caption}</figcaption> : null}
      <div ref={frame} {...scrollStopProps(scrollable, props.caption ? { labelledBy: captionId } : { label: "Table" })} className="max-h-[32rem] overflow-auto rounded-md border bg-card shadow-xs focus-visible:outline-2 focus-visible:outline-ring">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              {props.columns.map((column) => (
                <th key={column.key} scope="col" className={cn("border-b px-3 py-2 font-medium whitespace-nowrap text-muted-foreground", alignClass[column.align ?? (isNumeric(column.format) ? "right" : "left")])}>
                  <span className="inline-block max-w-[24ch] truncate align-bottom">{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={props.columns.length} className="px-3 py-6 text-center text-muted-foreground">No rows yet.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={index} className="border-b last:border-b-0 even:bg-muted/30">
                {props.columns.map((column) => {
                  const text = formatCellValue(row[column.key], column.format ?? "text", currency, digits.get(column.key) ?? 0);
                  return (
                    <td key={column.key} className={cn("max-w-[40ch] px-3 py-1.5 align-top", alignClass[column.align ?? (isNumeric(column.format) ? "right" : "left")], isNumeric(column.format) ? "whitespace-nowrap tabular-nums" : "wrap-anywhere", text === missingValue && "text-muted-foreground")}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.rows.length > initialRows ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Showing {rows.length.toLocaleString("en-US")} of {props.rows.length.toLocaleString("en-US")} rows.</span>
          <Button variant="ghost" size="xs" onClick={() => { setExpanded((value) => !value); }}>{expanded ? "Show fewer" : "Show all"}</Button>
        </div>
      ) : null}
    </figure>
  );
}

function changeTone(change: number, good: "up" | "down" | undefined) {
  if (change === 0 || !good) return "text-muted-foreground";
  return (change > 0) === (good === "up") ? "text-tone-success" : "text-tone-danger";
}

function ChangeGlyph({ change }: { change: number }) {
  if (change === 0) return <IconMinus aria-hidden className="size-3.5 shrink-0" />;
  return change > 0 ? <IconArrowUpRight aria-hidden className="size-3.5 shrink-0" /> : <IconArrowDownRight aria-hidden className="size-3.5 shrink-0" />;
}

function MetricChange({ props }: ViewProps<"Metric">) {
  const change = props.change;
  if (change === undefined) return null;
  const format = props.changeFormat ?? props.format ?? "number";
  const unit = props.unit && format !== "percent" ? ` ${props.unit}` : "";
  return (
    <p className={cn("flex min-w-0 items-center gap-1 text-sm tabular-nums", changeTone(change, props.goodDirection))}>
      <ChangeGlyph change={change} />
      <span className="truncate">
        {change > 0 ? "+" : ""}{formatNumber(change, format, props.currency ?? "USD")}{unit}
        {props.changeLabel ? <span className="text-muted-foreground"> {props.changeLabel}</span> : null}
      </span>
    </p>
  );
}

function sparklineSummary(props: UiProps<"Metric">): string {
  const numbers = (props.sparkline ?? []).filter((value): value is number => value !== null);
  const format = (value: number | undefined) => (value === undefined ? missingValue : formatNumber(value, props.format ?? "number", props.currency ?? "USD"));
  return `Trend over ${String(numbers.length)} points, from ${format(numbers[0])} to ${format(numbers.at(-1))}.`;
}

export function MetricView({ props, emit }: ViewProps<"Metric">) {
  const value = typeof props.value === "number" ? formatNumber(props.value, props.format ?? "number", props.currency ?? "USD") : props.value;
  return (
    <div className="card-surface flex min-w-0 flex-col gap-1 p-4">
      <p className="truncate text-sm text-muted-foreground" title={props.label}>{props.label}</p>
      <p className="flex min-w-0 items-baseline gap-1.5">
        <span className="min-w-0 text-2xl font-medium tracking-[-0.02em] break-all tabular-nums">{value}</span>
        {props.unit ? <span className="shrink-0 text-sm text-muted-foreground">{props.unit}</span> : null}
      </p>
      <MetricChange props={props} emit={emit} />
      {props.sparkline ? <Sparkline values={props.sparkline} summary={sparklineSummary(props)} /> : null}
    </div>
  );
}

export function ProgressView({ props }: ViewProps<"Progress">) {
  const max = props.max !== undefined && props.max > 0 ? props.max : 100;
  const ratio = Math.min(1, Math.max(0, props.value / 2 / (max / 2)));
  const text = props.format === "fraction" ? `${formatNumber(props.value)} of ${formatNumber(max)}` : `${formatNumber(Math.round(ratio * 1000) / 10)}%`;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{props.label ?? "Progress"}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{text}</span>
      </div>
      <div role="progressbar" aria-label={props.label ?? "Progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none" style={{ width: `${String(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

const statusDot = {
  done: "border-foreground bg-foreground text-background",
  current: "border-foreground bg-background ring-3 ring-foreground/15",
  upcoming: "border-input bg-background",
} as const;

export function TimelineView({ props }: ViewProps<"Timeline">) {
  if (props.items.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="min-w-0">
      {props.items.map((item, index) => {
        const status = item.status ?? "upcoming";
        return (
          <li key={`${String(index)}-${item.title}`} className="relative flex gap-3 pb-5 last:pb-0">
            {index < props.items.length - 1 ? <span aria-hidden className="absolute top-5 bottom-0 left-[7px] w-px bg-border" /> : null}
            <span aria-hidden className={cn("relative mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-full border", statusDot[status])}>
              {status === "done" ? <IconCheck className="size-2.5" stroke={3} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-md">
                <span className={cn("font-medium break-words", status === "upcoming" && "text-muted-foreground")}>{item.title}</span>
                {item.time ? <span className="text-xs text-muted-foreground break-words">{item.time}</span> : null}
                <span className="sr-only">({status})</span>
              </p>
              {item.description ? <p className="mt-1 text-sm leading-6 text-muted-foreground whitespace-pre-line break-words">{item.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DiagramView({ props }: ViewProps<"Diagram">) {
  return props.title ? <MermaidView code={props.code} title={props.title} /> : <MermaidView code={props.code} />;
}
