/*
 * A Grid's width steps, in one table: where each step starts, how many
 * columns the grid shows there, and the classes for those columns and for a
 * child's span. Columns follow the width of the interface (the `ui`
 * container on the renderer's root), never the window: two from 576px,
 * three from 608px, four from 896px. An artifact page's column is 976px at
 * most, and a docs example is about 630px, so a three-column grid shows
 * three columns in both.
 *
 * A span never passes the columns the grid shows at a step, so a child that
 * spans three of four columns takes both columns where the grid shows two,
 * and the whole row on a phone (one column, or `narrowColumns`). Classes
 * are written out whole so Tailwind finds them.
 */

type Classes = Readonly<Record<number, string>>;

interface GridStep {
  /** The interface width this step starts at, in pixels. */
  from: number;
  /** How many columns a grid with `columns` (and `narrowColumns` below 576px) shows from here, or null when it has no such step. */
  shows: (columns: number, narrowColumns: number) => number | null;
  columnClasses: Classes;
  spanClasses: Classes;
}

/** Every width step, narrowest first. */
export const gridSteps: readonly GridStep[] = [
  {
    from: 0,
    shows: (columns, narrowColumns) => Math.min(narrowColumns, columns),
    columnClasses: { 1: "grid-cols-1", 2: "grid-cols-2" },
    spanClasses: { 1: "col-span-1", 2: "col-span-2" },
  },
  {
    from: 576,
    shows: (columns) => (columns >= 2 ? 2 : null),
    columnClasses: { 2: "@xl/ui:grid-cols-2" },
    spanClasses: { 1: "@xl/ui:col-span-1", 2: "@xl/ui:col-span-2" },
  },
  {
    from: 608,
    shows: (columns) => (columns === 3 ? 3 : null),
    columnClasses: { 3: "@[38rem]/ui:grid-cols-3" },
    spanClasses: { 1: "@[38rem]/ui:col-span-1", 2: "@[38rem]/ui:col-span-2", 3: "@[38rem]/ui:col-span-3" },
  },
  {
    from: 896,
    shows: (columns) => (columns === 4 ? 4 : null),
    columnClasses: { 4: "@4xl/ui:grid-cols-4" },
    spanClasses: { 1: "@4xl/ui:col-span-1", 2: "@4xl/ui:col-span-2", 3: "@4xl/ui:col-span-3", 4: "@4xl/ui:col-span-4" },
  },
];

/** The steps a grid with `columns` has, each with the columns it shows there. */
function stepsOf(columns: number, narrowColumns: number): { step: GridStep; shows: number }[] {
  return gridSteps.flatMap((step) => {
    const shows = step.shows(columns, narrowColumns);
    return shows === null ? [] : [{ step, shows }];
  });
}

/** The column classes of a grid with `columns` (1 to 4), and `narrowColumns` on a phone. */
export function gridColumnClass(columns: number, narrowColumns = 1): string {
  return stepsOf(columns, narrowColumns).map(({ step, shows }) => step.columnClasses[shows] ?? "").join(" ");
}

/** The classes for a child spanning `span` columns of a grid with `columns` (and `narrowColumns` on a phone), clamped at every width step. */
export function gridSpanClass(span: number | undefined, columns: number, narrowColumns = 1): string {
  const wanted = Math.max(1, Math.floor(span ?? 1));
  return stepsOf(columns, narrowColumns).map(({ step, shows }) => step.spanClasses[Math.min(wanted, shows)] ?? "").join(" ");
}
