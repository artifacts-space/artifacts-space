import { z } from "zod";

/**
 * Bounded building blocks for component props. Every string has a maximum
 * length and every array a maximum size, so no valid spec can be unbounded.
 */

/** A short label: buttons, badges, axis names. */
export const label = (max = 120) => z.string().max(max);

/** Body text. */
export const prose = (max = 5000) => z.string().max(max);

/** A finite number. JSON cannot carry NaN or Infinity, and we never accept them. */
export const finiteNumber = () => z.number();

/** A three-letter ISO 4217 currency code such as "USD". */
export const currencyCode = () => z.string().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code such as USD.");

/** How numbers are shown in Metric, Table, Chart, and Progress. */
export const numberFormat = z.enum(["number", "compact", "percent", "currency"]);
export type NumberFormat = z.infer<typeof numberFormat>;

/** Color tone shared by Callout, Badge, and status-like components. */
export const tone = z.enum(["neutral", "info", "success", "warning", "danger"]);
export type Tone = z.infer<typeof tone>;

/** Spacing between children. */
export const gap = z.enum(["none", "sm", "md", "lg"]);
export type Gap = z.infer<typeof gap>;

/** A table cell or data point: text, number, yes/no, or empty. */
export const cellValue = z.union([z.string().max(2000), finiteNumber(), z.boolean(), z.null()]);
export type CellValue = z.infer<typeof cellValue>;
