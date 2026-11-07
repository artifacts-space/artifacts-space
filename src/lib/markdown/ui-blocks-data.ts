import { formatNumber, missingValue, sharedFractionDigits } from "@/lib/ui/number-format";

import { indentContinuation, inlineText, markdownTable } from "./text";
import {
  boldTitle,
  cellFormatOf,
  currencyOf,
  formatColumn,
  formatSeries,
  numberFormatOf,
  numberOf,
  objectsOf,
  textOf,
  textsOf,
  type BlockContext,
  type BlockRenderer,
} from "./ui-props";

/*
 * Markdown for the data, planning, and input components of a ui spec:
 * tables stay tables, metrics and key values become bullet points, charts
 * become their data table, and checklists become task lists.
 */

function present(blocks: (string | null)[]): string[] {
  return blocks.filter((block): block is string => Boolean(block));
}

function table({ props }: BlockContext): string[] {
  const columns = objectsOf(props.columns).filter((column) => typeof column.key === "string");
  if (columns.length === 0) return [];
  const rows = objectsOf(props.rows);
  const currency = currencyOf(props.currency);
  const formatted = columns.map((column) => formatColumn(rows.map((row) => row[String(column.key)]), cellFormatOf(column.format), currency));
  const header = columns.map((column) => textOf(column.label) ?? String(column.key));
  const body = rows.map((_, rowIndex) => formatted.map((cells) => cells[rowIndex] ?? ""));
  return present([boldTitle(props.caption), markdownTable(header, body)]);
}

function signed(value: number, format: string, currency: string): string {
  const text = formatNumber(value, numberFormatOf(format), currency);
  return value > 0 ? `+${text}` : text;
}

function metric({ props }: BlockContext): string[] {
  const label = inlineText(textOf(props.label) ?? "");
  const currency = currencyOf(props.currency);
  const number = numberOf(props.value);
  const value = number === null ? inlineText(textOf(props.value) ?? missingValue) : formatNumber(number, numberFormatOf(props.format), currency);
  const unit = textOf(props.unit);
  const change = numberOf(props.change);
  const changeLabel = textOf(props.changeLabel);
  const changeText = change === null ? "" : ` (${signed(change, typeof props.changeFormat === "string" ? props.changeFormat : "number", currency)}${changeLabel ? ` ${inlineText(changeLabel)}` : ""})`;
  return [`- **${label}:** ${value}${unit ? ` ${inlineText(unit)}` : ""}${changeText}`];
}

function labelledChart(props: Record<string, unknown>, series: Record<string, unknown>[]): string {
  const labels = textsOf(props.labels);
  const format = numberFormatOf(props.format);
  const currency = currencyOf(props.currency);
  const values = series.map((item) => (Array.isArray(item.values) ? (item.values as unknown[]) : []));
  const shared = sharedFractionDigits(values.flat().map(numberOf), format, currency);
  const columns = values.map((list) => formatSeries(labels.map((_, index) => list[index]), format, currency, shared));
  const header = [textOf(props.xLabel) ?? "Label", ...series.map((item, index) => textOf(item.name) ?? `Series ${String(index + 1)}`)];
  return markdownTable(header, labels.map((label, index) => [label, ...columns.map((column) => column[index] ?? missingValue)]));
}

function scatterChart(props: Record<string, unknown>, series: Record<string, unknown>[]): string {
  const yFormat = numberFormatOf(props.format);
  const xFormat = numberFormatOf(props.xFormat);
  const currency = currencyOf(props.currency);
  const rows = series.flatMap((item) =>
    objectsOf(item.points).map((point) => [
      textOf(item.name) ?? "",
      textOf(point.label) ?? "",
      formatSeries([point.x], xFormat, currency, 0)[0] ?? missingValue,
      formatSeries([point.y], yFormat, currency, 0)[0] ?? missingValue,
    ]),
  );
  return markdownTable(["Series", "Label", textOf(props.xLabel) ?? "x", textOf(props.yLabel) ?? "y"], rows);
}

function chart({ props }: BlockContext): string[] {
  const series = objectsOf(props.series);
  const type = typeof props.type === "string" ? props.type : "bar";
  const title = textOf(props.title);
  const caption = `**${title ? inlineText(title) : "Chart"}** (${type} chart)`;
  return [caption, type === "scatter" ? scatterChart(props, series) : labelledChart(props, series)];
}

function keyValue({ props }: BlockContext): string[] {
  const items = objectsOf(props.items);
  const currency = currencyOf(props.currency);
  const lines = items.map((item) => {
    const [value] = formatColumn([item.value], cellFormatOf(item.format), currency);
    return `- **${inlineText(textOf(item.label) ?? "")}:** ${inlineText(value ?? missingValue)}`;
  });
  return present([boldTitle(props.title), lines.length > 0 ? lines.join("\n") : null]);
}

function progress({ props }: BlockContext): string[] {
  const value = numberOf(props.value) ?? 0;
  const max = numberOf(props.max) ?? 100;
  const shown = props.format === "fraction" ? `${String(value)} of ${String(max)}` : `${String(Math.round((value / (max > 0 ? max : 100)) * 100))}%`;
  return [`- **${inlineText(textOf(props.label) ?? "Progress")}:** ${shown}`];
}

function timeline({ props }: BlockContext): string[] {
  const lines = objectsOf(props.items).map((item) => {
    const meta = [textOf(item.time), textOf(item.status)].filter(Boolean).map((part) => inlineText(part ?? ""));
    const description = textOf(item.description);
    const head = `- **${inlineText(textOf(item.title) ?? "")}**${meta.length > 0 ? ` (${meta.join(", ")})` : ""}`;
    return description ? `${head}\n  ${indentContinuation(description, 2)}` : head;
  });
  return lines.length > 0 ? [lines.join("\n")] : [];
}

function boardCard(card: Record<string, unknown>): string {
  const badges = objectsOf(card.badges).flatMap((badge) => textOf(badge.label) ?? []);
  const owner = textOf(card.owner);
  const due = textOf(card.due);
  const meta = [owner ? `owner ${owner}` : null, due ? `due ${due}` : null, ...badges].filter((part): part is string => Boolean(part)).map(inlineText);
  const body = textOf(card.body);
  const head = `- ${inlineText(textOf(card.title) ?? "")}${meta.length > 0 ? ` (${meta.join(", ")})` : ""}`;
  return body ? `${head}\n  ${indentContinuation(body, 2)}` : head;
}

function board({ props }: BlockContext): string[] {
  const columns = objectsOf(props.columns).flatMap((column) => {
    const cards = objectsOf(column.cards);
    const count = numberOf(column.count) ?? cards.length;
    return [`**${inlineText(textOf(column.title) ?? "")}** (${String(count)})`, cards.length > 0 ? cards.map(boardCard).join("\n") : "_No cards._"];
  });
  return present([boldTitle(props.title), ...columns]);
}

function eventLine(event: Record<string, unknown>): string {
  const start = (textOf(event.start) ?? "").replace("T", " ");
  const end = textOf(event.end)?.replace("T", " ");
  const note = textOf(event.note);
  const when = `${start}${end ? ` to ${end}` : ""}${event.allDay === true ? " (all day)" : ""}`;
  return `- ${when}: ${inlineText(textOf(event.title) ?? "")}${note ? ` (${inlineText(note)})` : ""}`;
}

function calendar({ props }: BlockContext): string[] {
  const events = objectsOf(props.events).sort((a, b) => (textOf(a.start) ?? "").localeCompare(textOf(b.start) ?? ""));
  const zone = textOf(props.timeZone);
  return present([boldTitle(props.title), zone ? `Time zone: ${inlineText(zone)}. Times are as written.` : null, events.length > 0 ? events.map(eventLine).join("\n") : "_No events._"]);
}

function task(label: unknown, checked: unknown, description?: unknown): string {
  const extra = textOf(description);
  return `- [${checked === true ? "x" : " "}] ${inlineText(textOf(label) ?? "")}${extra ? ` (${inlineText(extra)})` : ""}`;
}

function checklist({ props }: BlockContext): string[] {
  const items = objectsOf(props.items).map((item) => task(item.label, item.checked));
  return present([boldTitle(props.title), items.length > 0 ? items.join("\n") : null]);
}

function select({ props }: BlockContext): string[] {
  const value = textOf(props.value);
  const options = textsOf(props.options).map(inlineText).join(", ");
  return [`- **${inlineText(textOf(props.label) ?? "")}:** ${value ? inlineText(value) : "not chosen"} (options: ${options})`];
}

function slider({ props }: BlockContext): string[] {
  const min = numberOf(props.min) ?? 0;
  const max = numberOf(props.max) ?? 100;
  const value = numberOf(props.value) ?? min;
  return [`- **${inlineText(textOf(props.label) ?? "")}:** ${String(value)} (from ${String(min)} to ${String(max)})`];
}

function toggle({ props }: BlockContext): string[] {
  const description = textOf(props.description);
  return [`- **${inlineText(textOf(props.label) ?? "")}:** ${props.checked === true ? "on" : "off"}${description ? ` (${inlineText(description)})` : ""}`];
}

/** Renderers for data, planning, and input components. */
export const dataBlocks: Record<string, BlockRenderer> = {
  Table: table,
  Metric: metric,
  Chart: chart,
  KeyValue: keyValue,
  Progress: progress,
  Timeline: timeline,
  Board: board,
  Calendar: calendar,
  Checklist: checklist,
  Checkbox: ({ props }) => [task(props.label, props.checked, props.description)],
  Switch: toggle,
  Select: select,
  Slider: slider,
  Button: ({ props }) => [`_Button: ${inlineText(textOf(props.label) ?? "")}_`],
};
