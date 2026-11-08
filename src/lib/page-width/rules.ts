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
