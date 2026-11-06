import { isPlainObject } from "@/lib/ui/json-walk";
import { formatCellValue, formatNumber } from "@/lib/ui/number-format";
import { cellFormat, numberFormat } from "@/lib/ui/props/shared";

import type { Sketch, Synopsis, SynopsisMetric } from "./synopsis-types";
import { truncate } from "./text-utils";

/*
 * A synopsis of a ui (json-render) spec: its first metrics, chart, or table,
 * read defensively. Specs come from agents, so every field is checked here
 * instead of trusting the schema; anything odd is skipped.
 */

const maxElements = 400;
const maxSketchPoints = 24;

interface UiElement {
  type: string;
  props: Record<string, unknown>;
}

function elementAt(elements: Record<string, unknown>, id: unknown): (UiElement & { children: unknown[] }) | null {
  if (typeof id !== "string") return null;
  const element = elements[id];
  if (!isPlainObject(element) || typeof element.type !== "string") return null;
  const props = isPlainObject(element.props) ? element.props : {};
  const children = Array.isArray(element.children) ? element.children : [];
  return { type: element.type, props, children };
}

/** Elements in reading order (depth first from the root), at most `maxElements`. */
export function uiElementsInOrder(spec: unknown): UiElement[] {
  if (!isPlainObject(spec) || !isPlainObject(spec.elements)) return [];
  const { elements } = spec;
  const ordered: UiElement[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [spec.root];
  while (stack.length > 0 && ordered.length < maxElements) {
    const id = stack.pop();
    const element = elementAt(elements, id);
    if (!element || typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    ordered.push({ type: element.type, props: element.props });
    for (let index = element.children.length - 1; index >= 0; index -= 1) stack.push(element.children[index]);
  }
  return ordered;
}

function finiteNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice(0, maxSketchPoints);
}

/**
 * Numbers scaled to 0..1. Bars start at zero (or the minimum, when it is
 * negative); lines span their own range so the trend shows. Null under two points.
 */
export function sketchFrom(values: number[], shape: Sketch["shape"]): Sketch | null {
  if (values.length < 2) return null;
  const low = shape === "line" ? Math.min(...values) : Math.min(0, ...values);
  const high = Math.max(...values);
  const span = high - low;
  return { shape, values: values.map((value) => (span === 0 ? 0.5 : (value - low) / span)) };
}

function metricOf(props: Record<string, unknown>): SynopsisMetric | null {
  if (typeof props.label !== "string") return null;
  const format = numberFormat.safeParse(props.format);
  const currency = typeof props.currency === "string" ? props.currency : "USD";
  const unit = typeof props.unit === "string" && props.unit ? ` ${props.unit}` : "";
  if (typeof props.value === "number") return { label: truncate(props.label, 28), value: truncate(`${formatNumber(props.value, format.success ? format.data : "number", currency)}${unit}`, 12) };
  if (typeof props.value === "string" && props.value) return { label: truncate(props.label, 28), value: truncate(props.value, 12) };
  return null;
}

function chartOf(props: Record<string, unknown>): { title: string | null; sketch: Sketch } | null {
  if (!Array.isArray(props.series)) return null;
  const first: unknown = props.series[0];
  if (!isPlainObject(first)) return null;
  const scatter = Array.isArray(first.points) ? first.points.map((point) => (isPlainObject(point) ? point.y : null)) : [];
  const values = finiteNumbers(first.values ?? scatter);
  const shape = props.type === "line" || props.type === "area" || props.type === "scatter" ? "line" : "bar";
  const sketch = sketchFrom(values, shape);
  if (!sketch) return null;
  return { title: typeof props.title === "string" ? truncate(props.title, 40) : null, sketch };
}

function tableCell(row: unknown, column: { key: string; format: string }): string {
  if (!isPlainObject(row)) return "";
  const value = row[column.key];
  const format = cellFormat.safeParse(column.format);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return truncate(formatCellValue(value, format.success ? format.data : "text", "USD"), 14);
  }
  return "";
}

function tableOf(props: Record<string, unknown>): { header: string[]; rows: string[][] } | null {
  if (!Array.isArray(props.columns) || !Array.isArray(props.rows)) return null;
  const columns = props.columns
    .filter(isPlainObject)
    .filter((column) => typeof column.key === "string" && typeof column.label === "string")
    .slice(0, 4)
    .map((column) => ({ key: String(column.key), label: truncate(String(column.label), 14), format: typeof column.format === "string" ? column.format : "text" }));
  if (columns.length === 0) return null;
  const rows = props.rows.slice(0, 4).map((row) => columns.map((column) => tableCell(row, column)));
  return { header: columns.map((column) => column.label), rows };
}

interface Found {
  metrics: SynopsisMetric[];
  chart: { title: string | null; sketch: Sketch } | null;
  table: { header: string[]; rows: string[][] } | null;
  names: string[];
}

function collect(elements: UiElement[]): Found {
  const found: Found = { metrics: [], chart: null, table: null, names: [] };
  for (const { type, props } of elements) {
    if (!found.names.includes(type)) found.names.push(type);
    if (type === "Metric" && found.metrics.length < 3) {
      const metric = metricOf(props);
      if (metric) found.metrics.push(metric);
    }
    if (type === "Chart") found.chart ??= chartOf(props);
    if (type === "Table") found.table ??= tableOf(props);
  }
  return found;
}

/**
 * The first one to three Metrics (with a sketch of the first Chart when there
 * is one), else the first Chart, else the first Table, else the component
 * types used. Null when the content is not a spec.
 */
export function uiSynopsis(content: string): Synopsis | null {
  let spec: unknown;
  try {
    spec = JSON.parse(content);
  } catch {
    return null;
  }
  const elements = uiElementsInOrder(spec);
  if (elements.length === 0) return null;
  const found = collect(elements);
  if (found.metrics.length > 0) return { type: "metrics", metrics: found.metrics, sketch: found.chart?.sketch ?? null };
  if (found.chart) return { type: "chart", title: found.chart.title, sketch: found.chart.sketch };
  if (found.table) return { type: "table", ...found.table };
  return { type: "components", names: found.names.slice(0, 6) };
}
