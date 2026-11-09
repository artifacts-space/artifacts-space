import { z } from "zod";

import { sheetFormatLimits } from "./limits";

/*
 * A sheet's formatting, saved on the artifact like "Full width": banded rows
 * and each column's alignment. Editors set it; every reader sees it. It is a
 * display setting, not part of the CSV, so it files no version.
 */

export const sheetAlignments = ["left", "center", "right"] as const;
/** A column's chosen alignment. "auto" (numbers right, everything else left) is stored as no entry. */
export type SheetAlignment = (typeof sheetAlignments)[number];
export type SheetAlignmentChoice = SheetAlignment | "auto";

export const sheetBandings = ["muted", "accent", "primary"] as const;
/** The tint of every other row, built from a theme token; null is no banding. */
export type SheetBanding = (typeof sheetBandings)[number];

export interface SheetFormat {
  banding: SheetBanding | null;
  /** Column key (columnKeys) to its alignment, only for columns not on auto. */
  align: Readonly<Record<string, SheetAlignment>>;
}

/** No banding, every column on auto: how a sheet looks until an editor changes it. */
export const plainSheetFormat: SheetFormat = { banding: null, align: {} };

/** The stored and accepted shape. Strict, so nothing else rides along in the column. */
export const sheetFormatSchema = z
  .object({
    banding: z.enum(sheetBandings).nullable(),
    align: z
      .record(z.string().min(1).max(sheetFormatLimits.maxKeyChars), z.enum(sheetAlignments))
      .refine((align) => Object.keys(align).length <= sheetFormatLimits.maxAlignedColumns, { message: `Align at most ${String(sheetFormatLimits.maxAlignedColumns)} columns.` }),
  })
  .strict();

/** Whether the formatting, as JSON text, is small enough to parse and store: measured in UTF-8 bytes, as the database measures it. */
export function fitsSheetFormatInput(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= sheetFormatLimits.maxInputBytes;
  } catch {
    return false;
  }
}

/**
 * Reads stored formatting. Anything missing or invalid reads as plain, so a
 * bad row can never break the page.
 */
export function readSheetFormat(value: unknown): SheetFormat {
  if (value === null || value === undefined) return plainSheetFormat;
  const parsed = sheetFormatSchema.safeParse(value);
  return parsed.success ? parsed.data : plainSheetFormat;
}

/** What to store: null when the sheet is plain, so plain sheets keep an empty column. */
export function storedSheetFormat(format: SheetFormat): SheetFormat | null {
  return format.banding === null && Object.keys(format.align).length === 0 ? null : format;
}

/**
 * The formatting with one column's alignment changed. "auto" removes the
 * entry. Entries for columns the sheet no longer has (`liveKeys`) are
 * dropped, so the saved formatting never grows past the sheet.
 */
export function withAlignment(format: SheetFormat, key: string, choice: SheetAlignmentChoice, liveKeys: readonly string[]): SheetFormat {
  const live = new Set(liveKeys);
  const align: Record<string, SheetAlignment> = {};
  for (const [column, alignment] of Object.entries(format.align)) {
    if (live.has(column) && column !== key) align[column] = alignment;
  }
  if (choice !== "auto") align[key] = choice;
  return { ...format, align };
}

/** The formatting with banding turned off (null) or set to a tint. */
export function withBanding(format: SheetFormat, banding: SheetBanding | null): SheetFormat {
  return { ...format, banding };
}

/** A column's chosen alignment, or "auto" when it has none. */
export function alignmentChoice(format: SheetFormat, key: string): SheetAlignmentChoice {
  return format.align[key] ?? "auto";
}

/** How a column's cells line up: its chosen alignment, or on auto, numbers right and everything else left. */
export function cellAlignment(format: SheetFormat, key: string, numeric: boolean): SheetAlignment {
  return format.align[key] ?? (numeric ? "right" : "left");
}

/** Whether a column key is short enough to save an alignment for. */
export function canAlignColumn(key: string): boolean {
  return key.length <= sheetFormatLimits.maxKeyChars;
}

/**
 * The fill of every other row (the even ones, counting from 1), from theme
 * tokens at a low mix so text keeps its contrast in light and dark, with a
 * slightly deeper fill under the pointer so a hovered row stays banded.
 * Literal class names so Tailwind finds them.
 */
export function bandClass(banding: SheetBanding | null): string {
  if (banding === "muted") return "bg-muted/60 hover:bg-muted/80";
  if (banding === "accent") return "bg-accent/60 hover:bg-accent/80";
  if (banding === "primary") return "bg-primary/6 hover:bg-primary/10";
  return "";
}

/** The menu names of the banding choices. */
export const bandingLabels: Record<SheetBanding, string> = { muted: "Gray", accent: "Accent", primary: "Tinted" };

/** The menu names of the alignment choices. */
export const alignmentLabels: Record<SheetAlignmentChoice, string> = { auto: "Auto", left: "Left", center: "Center", right: "Right" };
