/**
 * Board column sizing, in pure CSS so the server and the browser agree and
 * nothing is measured in JavaScript. The board's scroller is a size
 * container, so `100cqw` is the width the columns can use.
 *
 * - When every column fits at `minColumn`, the columns share the width
 *   equally and nothing scrolls.
 * - When they do not fit, each column takes `peekColumn` (wide enough to
 *   read, narrow enough that the next column peeks in) and the board
 *   scrolls sideways inside itself, with a fade at the scroll edge.
 *
 * The switch is `(need - 100cqw) * 1000`: zero or less when the columns fit,
 * a large length when they do not, clamped by min() and max().
 */

/** Space between columns. */
export const boardGap = "0.75rem";
/** Narrowest a column may be while columns share the width. */
export const boardMinColumn = "12rem";
/** Column width while the board scrolls: most of the board, leaving room for the next column to peek in. */
export const boardPeekColumn = `clamp(${boardMinColumn}, 100cqw - 4.5rem, 17rem)`;
/** Width of the fade at the scroll edge. */
export const boardFade = "2rem";

/** CSS custom properties for a board with `columnCount` columns. Set them on the scroller. */
export function boardLayoutVars(columnCount: number): Record<string, string> {
  const count = String(Math.max(1, Math.floor(columnCount)));
  const gaps = `(${count} - 1) * ${boardGap}`;
  const need = `(${count} * ${boardMinColumn} + ${gaps})`;
  const overflowSwitch = `(${need} - 100cqw) * 1000`;
  return {
    "--board-gap": boardGap,
    "--board-column": `max(calc((100cqw - ${gaps}) / ${count}), min(${boardPeekColumn}, calc(${overflowSwitch})))`,
    "--board-fade": `min(${boardFade}, max(0px, calc(${overflowSwitch})))`,
  };
}
