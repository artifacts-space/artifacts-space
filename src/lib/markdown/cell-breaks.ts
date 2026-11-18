/*
 * A line break inside a GFM table cell. Pipe tables hold one line per row,
 * so a cell's line break is written as `<br>`, as GitHub reads it. The
 * editor writes it that way (Tiptap's table writer), and every reader takes
 * `<br>`, `<br/>`, and `<br />` in a cell as a line break: the editor's
 * loader (markdown-cell-breaks.ts) and the read view (remark-cell-breaks.ts).
 * Outside a table cell, `<br>` is raw HTML and stays as written.
 */

const lineBreakTag = /^<br\s*\/?>$/i;

/** True when `raw` is a line break tag and nothing else: `<br>`, `<br/>`, or `<br />`, in any letter case. */
export function isLineBreakTag(raw: string): boolean {
  return lineBreakTag.test(raw.trim());
}
