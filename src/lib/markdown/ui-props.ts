import { isPlainObject } from "@/lib/ui/json-walk";
import { formatCellValue, formatNumber, missingValue, sharedFractionDigits } from "@/lib/ui/number-format";
import { cellFormat, numberFormat, type CellFormat, type CellValue, type NumberFormat } from "@/lib/ui/props/shared";

/*
 * Defensive prop readers for the ui (json-render) to Markdown renderer.
 * Specs are validated when saved, but the renderer still checks every field,
 * so an odd value is skipped instead of breaking the whole page.
 */

/** A link to an uploaded file, or null when the reader may not see it. */
export type FileLinkResolver = (fileId: string) => { name: string; url: string } | null;

/** What one component renderer gets. */
export interface BlockContext {
  props: Record<string, unknown>;
  /** The heading level for this element's own title (2 to 6). */
  level: number;
  /** Every child, rendered one level deeper. */
  children: () => string[];
  /** One child by position, rendered one level deeper. */
  child: (index: number) => string[];
  fileLink: FileLinkResolver;
}

/** Turns one component into Markdown blocks (joined with blank lines). */
export type BlockRenderer = (context: BlockContext) => string[];

/** A prop as text: strings as they are, numbers and booleans written out, anything else null. */
export function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

/** A finite number prop, or null. */
export function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The object items of an array prop. Anything else reads as empty. */
export function objectsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

/** The text items of an array prop, numbers written out. */
export function textsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => textOf(item) ?? []);
}

/** A heading of the given level (clamped to 2 to 6, since the page title is the only level 1). */
export function heading(level: number, text: string): string {
  return `${"#".repeat(Math.min(6, Math.max(2, level)))} ${text.replace(/\s+/g, " ").trim()}`;
}

/** A number format prop, or the fallback. */
export function numberFormatOf(value: unknown, fallback: NumberFormat = "number"): NumberFormat {
  const parsed = numberFormat.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

/** A cell format prop, or "text". */
export function cellFormatOf(value: unknown): CellFormat {
  const parsed = cellFormat.safeParse(value);
  return parsed.success ? parsed.data : "text";
}

/** A currency prop, or USD. */
export function currencyOf(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z]{3}$/.test(value) ? value : "USD";
}

/** A table cell or data point, or undefined when it is not one. */
export function cellValueOf(value: unknown): CellValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  return numberOf(value) ?? undefined;
}

/** Formats a column of cells together, so their decimals line up as they do on the page. */
export function formatColumn(values: readonly unknown[], format: CellFormat, currency: string): string[] {
  const cells = values.map(cellValueOf);
  const numbers = cells.map((cell) => (typeof cell === "number" ? cell : null));
  const shared = format === "text" ? 0 : sharedFractionDigits(numbers, format, currency);
  return cells.map((cell) => formatCellValue(cell, format, currency, shared));
}

/** Formats a series of numbers together. Gaps show a dash. */
export function formatSeries(values: readonly unknown[], format: NumberFormat, currency: string, shared: number): string[] {
  return values.map((value) => {
    const number = numberOf(value);
    return number === null ? missingValue : formatNumber(number, format, currency, shared);
  });
}

/** A bold label for a component's own title, or null when it has none. */
export function boldTitle(value: unknown): string | null {
  const title = textOf(value)?.replace(/\s+/g, " ").trim();
  return title ? `**${title}**` : null;
}
