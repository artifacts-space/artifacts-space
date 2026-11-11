import type { ArtifactKind } from "@/lib/artifact-types";

/**
 * Page width for one artifact, like Notion's "Full width": contained (the
 * default) keeps today's reading width; full width uses the whole window,
 * with side padding that still fits a phone. These are literal class names
 * so Tailwind finds them.
 */

/** The menu label for the setting. */
export const FULL_WIDTH_LABEL = "Full width";

/**
 * The contained column's cap, shared by the page, the /app panes, and the
 * Edit view. Change the reading width here, once. `max-w-5xl` is 64rem:
 * 1024px at the default font size. It is in rem on purpose, so the column
 * grows with a reader's larger font size, as the 72ch prose measure does.
 */
const CONTAINED_COLUMN = "max-w-5xl";

/**
 * The public page's column (header, notice, main, footer): the contained
 * column, or the whole window. Full width keeps the contained column's
 * padding until the window is wide enough (xl, 80rem) for the wider padding
 * to still leave it well past the contained column, so turning Full width
 * on never makes the page narrower.
 */
export function pageColumnClass(fullWidth: boolean): string {
  return fullWidth ? "max-w-none px-6 xl:px-16" : `${CONTAINED_COLUMN} px-6`;
}

/**
 * The class for the wrapper around an artifact's body. Full width lifts the
 * 72ch reading measure of Markdown and plain text (`--artifact-measure` in
 * globals.css); contained adds nothing, so it looks exactly as before.
 */
export function readingMeasureClass(fullWidth: boolean): string {
  return fullWidth ? "[--artifact-measure:none]" : "";
}

/**
 * The column an artifact's body sits in inside the /app panes. Contained,
 * it is the public page's own column (pageColumnClass): everything (text,
 * callouts, tabs, diagrams) keeps to the centered column readers see.
 * Full width uses the whole pane and lifts the reading measure; it keeps the
 * page's base padding only, because a pane is narrower than the window the
 * page's wider padding is sized for. The pane keeps its top and bottom padding.
 */
export function previewColumnClass(fullWidth: boolean): string {
  return fullWidth ? "mx-auto w-full min-w-0 max-w-none px-6 [--artifact-measure:none]" : `mx-auto w-full min-w-0 ${pageColumnClass(false)}`;
}

/**
 * The /app Edit view's column: the source field keeps to the same
 * column as the preview when contained, and spans the pane when full width.
 */
export function editColumnClass(fullWidth: boolean): string {
  return fullWidth ? "w-full" : `mx-auto w-full ${CONTAINED_COLUMN}`;
}

/**
 * Whether an artifact's body uses the whole width. A spreadsheet (CSV)
 * always does, whatever its Full width setting, as a sheet does in a
 * spreadsheet app; every other kind follows the setting.
 */
export function usesFullWidth(kind: ArtifactKind, fullWidth: boolean): boolean {
  return fullWidth || kind === "csv";
}

/** Whether the Full width setting does anything for this kind: it does not for a CSV, which is always full width. */
export function hasWidthSetting(kind: ArtifactKind): boolean {
  return kind !== "csv";
}
