import { z } from "zod";

import { maxPieSlices } from "../chart-pie";
import { currencyCode, finiteNumber, label, numberFormat } from "./shared";

/** Chart types. Bar, line, and area share `labels`; pie and donut use one series; scatter uses points. */
export const chartTypes = ["bar", "line", "area", "pie", "donut", "scatter"] as const;
export type ChartType = (typeof chartTypes)[number];

/** Most series one chart draws: one per categorical color. */
export const maxChartSeries = 8;

const scatterPoint = z.object({
  x: finiteNumber(),
  y: finiteNumber(),
  label: label(80).optional(),
});

const chartSeries = z.object({
  name: label(60),
  values: z.array(z.union([finiteNumber(), z.null()])).max(200).optional(),
  points: z.array(scatterPoint).max(500).optional(),
});

/** Props for Chart. Which fields apply depends on `type`; `chartCheck` enforces it. */
export const chartProps = z.object({
  type: z.enum(chartTypes),
  labels: z.array(label(40)).max(200).optional(),
  series: z.array(chartSeries).min(1).max(maxChartSeries),
  title: label(160).optional(),
  format: numberFormat.optional(),
  currency: currencyCode().optional(),
  height: z.enum(["sm", "md", "lg"]).optional(),
  stacked: z.boolean().optional(),
  xLabel: label(60).optional(),
  yLabel: label(60).optional(),
  xFormat: numberFormat.optional(),
});

type ChartProps = z.output<typeof chartProps>;

function labelledCheck(props: ChartProps): string[] {
  const count = props.labels?.length ?? 0;
  return props.series.flatMap((series) => {
    if (series.points !== undefined) return [`Series "${series.name}" has points, which only scatter charts use. Give a ${props.type} chart one value per label in \`values\`.`];
    if (series.values === undefined) return [`Series "${series.name}" needs \`values\`: one number (or null for a gap) per label.`];
    if (series.values.length !== count) return [`Series "${series.name}" has ${String(series.values.length)} values but there are ${String(count)} labels. Give each series one value per label (use null for a gap).`];
    return [];
  });
}

function pieCheck(props: ChartProps): string[] {
  if (props.series.length !== 1) {
    return [`A ${props.type} chart shows one series, but there are ${String(props.series.length)}. Put one value per slice in series[0].values and the slice names in labels. For several series, use a bar chart.`];
  }
  const problems = labelledCheck(props);
  const negative = (props.series[0]?.values ?? []).findIndex((value) => value !== null && value < 0);
  if (negative !== -1) problems.push(`${props.type === "pie" ? "Pie" : "Donut"} values must be zero or more, but series[0].values[${String(negative)}] is negative. Use a bar chart for values below zero.`);
  return problems;
}

function scatterCheck(props: ChartProps): string[] {
  return props.series.flatMap((series) => {
    if (series.values !== undefined) return [`Series "${series.name}" has values, but a scatter chart reads \`points\`: [{ "x": 1, "y": 2 }, …]. Move the data into points.`];
    if (series.points === undefined) return [`Series "${series.name}" needs \`points\`: [{ "x": 1, "y": 2, "label": "optional" }, …].`];
    return [];
  });
}

const stackable: ReadonlySet<ChartType> = new Set(["bar", "area"]);

/** Cross-field rules for Chart: which data shape each type needs. */
export function chartCheck(props: Record<string, unknown>): string[] {
  const parsed = chartProps.safeParse(props);
  if (!parsed.success) return [];
  const data = parsed.data;
  const stackProblem = data.stacked === true && !stackable.has(data.type) ? [`stacked works with bar and area charts only, not ${data.type}. Remove stacked.`] : [];
  if (data.type === "pie" || data.type === "donut") return [...stackProblem, ...pieCheck(data)];
  if (data.type === "scatter") return [...stackProblem, ...scatterCheck(data)];
  return [...stackProblem, ...labelledCheck(data)];
}

/** Agent-facing summary of chart types, for the catalog and guide. */
export const chartDescription = [
  "A chart. `type`: bar, line, or area (`labels` are the x-axis; each series has one value per label, null for a gap);",
  `pie or donut (one series; \`labels\` name the slices; values zero or more; more than ${String(maxPieSlices)} slices fold into "Other");`,
  "scatter (each series has `points` [{ x, y, label? }]; no labels).",
  "Several bar series draw grouped bars; `stacked: true` stacks bar or area series.",
  "`format` styles values (y); `xFormat` styles scatter x values; `xLabel`/`yLabel` name the axes.",
].join(" ");
