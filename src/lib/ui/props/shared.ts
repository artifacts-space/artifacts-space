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

/** How a table cell or key-value value is shown: as written, or as a formatted number. */
export const cellFormat = z.enum(["text", "number", "compact", "percent", "currency"]);
export type CellFormat = z.infer<typeof cellFormat>;

/** A table column also takes "check": true draws a check mark and false a dash, for a comparison table. */
export const columnFormat = z.enum([...cellFormat.options, "check"]);
export type ColumnFormat = z.infer<typeof columnFormat>;

/** Color tone shared by Callout, Badge, and status-like components. */
export const tone = z.enum(["neutral", "info", "success", "warning", "danger"]);
export type Tone = z.infer<typeof tone>;

/** A Badge also takes "accent": the accent color (the theme's, or blue on the default palette), for a label that is not a status (New, Featured). */
export const badgeTones = z.enum([...tone.options, "accent"]);
export type BadgeTone = z.infer<typeof badgeTones>;

/** Spacing between children. */
export const gap = z.enum(["none", "sm", "md", "lg"]);
export type Gap = z.infer<typeof gap>;

/** A table cell or data point: text, number, yes/no, or empty. */
export const cellValue = z.union([z.string().max(2000), finiteNumber(), z.boolean(), z.null()]);
export type CellValue = z.infer<typeof cellValue>;

/** Spacing for a Box's gap and padding: 0, 4, 8, 16, 24, 40, 64, and 96 pixels. The three largest are smaller on narrow surfaces. */
export const space = z.enum(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"]);
export type Space = z.infer<typeof space>;

/** Corner rounding for boxes and placeholders. */
export const radius = z.enum(["none", "sm", "md", "lg", "xl", "full"]);
export type Radius = z.infer<typeof radius>;

/** Horizontal text alignment. */
export const textAlign = z.enum(["start", "center", "end"]);
export type TextAlign = z.infer<typeof textAlign>;

/**
 * A width of the surface the interface is drawn on (the page column, or a
 * canvas frame), never of the browser window: sm is 576, md is 672, and lg
 * is 896 pixels.
 */
export const containerStep = z.enum(["sm", "md", "lg"]);
export type ContainerStep = z.infer<typeof containerStep>;

/** Width to height shapes for placeholders. */
export const aspectRatio = z.enum(["square", "photo", "video", "wide", "portrait"]);
export type AspectRatio = z.infer<typeof aspectRatio>;
