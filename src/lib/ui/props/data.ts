import { z } from "zod";

import { chartCheck, chartProps } from "./chart";
import { cellFormat, cellValue, currencyCode, finiteNumber, label, numberFormat, prose, tone } from "./shared";

const tableColumn = z.object({
  key: label(60),
  label: label(80),
  align: z.enum(["left", "center", "right"]).optional(),
  format: cellFormat.optional(),
});

const keyValueItem = z.object({
  label: label(80),
  value: cellValue,
  format: cellFormat.optional(),
  tone: tone.optional(),
  mono: z.boolean().optional(),
});

const timelineItem = z.object({
  title: label(160),
  time: label(60).optional(),
  description: prose(1000).optional(),
  status: z.enum(["done", "current", "upcoming"]).optional(),
});

/** Props for data components. Cross-field rules live in `dataChecks`. */
export const dataProps = {
  Table: z.object({
    columns: z.array(tableColumn).min(1).max(20),
    rows: z.array(z.record(z.string().max(60), cellValue)).max(500),
    caption: label(200).optional(),
    currency: currencyCode().optional(),
  }),
  Metric: z.object({
    label: label(80),
    value: z.union([finiteNumber(), label(40)]),
    unit: label(20).optional(),
    format: numberFormat.optional(),
    currency: currencyCode().optional(),
    change: finiteNumber().optional(),
    changeFormat: numberFormat.optional(),
    changeLabel: label(60).optional(),
    goodDirection: z.enum(["up", "down"]).optional(),
    sparkline: z.array(z.union([finiteNumber(), z.null()])).max(200).optional(),
  }),
  Chart: chartProps,
  KeyValue: z.object({
    items: z.array(keyValueItem).max(100),
    title: label(160).optional(),
    currency: currencyCode().optional(),
    columns: z.number().int().min(1).max(2).optional(),
  }),
  Progress: z.object({
    value: finiteNumber(),
    max: finiteNumber().optional(),
    label: label(120).optional(),
    format: z.enum(["percent", "fraction"]).optional(),
  }),
  Timeline: z.object({
    items: z.array(timelineItem).max(100),
  }),
  Diagram: z.object({
    code: prose(20_000),
    title: label(160).optional(),
  }),
};

/** A rule that spans several props. Returns plain-language problems. */
export type PropCheck = (props: Record<string, unknown>) => string[];

function progressCheck(props: Record<string, unknown>): string[] {
  const parsed = dataProps.Progress.safeParse(props);
  if (!parsed.success || parsed.data.max === undefined) return [];
  return parsed.data.max > 0 ? [] : ["max must be greater than 0."];
}

/** Cross-field rules for data components. */
export const dataChecks: Partial<Record<keyof typeof dataProps, PropCheck>> = {
  Chart: chartCheck,
  Progress: progressCheck,
};
