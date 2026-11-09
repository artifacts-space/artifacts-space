/**
 * Page width for one artifact, like Notion's "Full width": contained (the
 * default) keeps today's reading width; full width uses the whole window,
 * with side padding that still fits a phone. These are literal class names
 * so Tailwind finds them.
 */

/** The menu label for the setting. */
export const FULL_WIDTH_LABEL = "Full width";

/**
 * The public page's column (header, notice, main, footer): the 960px column
 * it has always had, or the whole window with wider padding on larger screens.
 */
export function pageColumnClass(fullWidth: boolean): string {
  return fullWidth ? "max-w-none px-6 sm:px-10 lg:px-16" : "max-w-[960px] px-6";
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
 * callouts, tabs, diagrams) keeps to the centered 960px column readers see.
 * Full width uses the whole pane and lifts the reading measure; it keeps the
 * page's base padding only, because a pane is narrower than the window the
 * page's wider padding is sized for. The pane keeps its top and bottom padding.
 */
export function previewColumnClass(fullWidth: boolean): string {
  return fullWidth ? "mx-auto w-full min-w-0 max-w-none px-6 [--artifact-measure:none]" : `mx-auto w-full min-w-0 ${pageColumnClass(false)}`;
}

/**
 * The /app Edit view's column: the source field keeps to the same 960px
 * column as the preview when contained, and spans the pane when full width.
 */
export function editColumnClass(fullWidth: boolean): string {
  return fullWidth ? "w-full" : "mx-auto w-full max-w-[960px]";
}

/**
 * Whether an artifact's body uses the whole width. A spreadsheet (CSV)
 * always does, whatever its Full width setting, as a sheet does in a
 * spreadsheet app; every other kind follows the setting.
 */
export function usesFullWidth(kind: string, fullWidth: boolean): boolean {
  return fullWidth || kind === "csv";
}

/** Whether the Full width setting does anything for this kind: it does not for a CSV, which is always full width. */
export function hasWidthSetting(kind: string): boolean {
  return kind !== "csv";
}
