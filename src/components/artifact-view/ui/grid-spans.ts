/*
 * How many columns a Grid child spans at each width step of the grid. A
 * span never passes the columns the grid shows at that width, so a child
 * that spans three of four columns takes both columns where the grid shows
 * two, and the whole row on a phone (one column, or `narrowColumns`).
 * Classes are written out whole so Tailwind finds them, and they are
 * container variants on the interface's own container (`ui`), never the
 * window's.
 */

type Spans = Readonly<Record<number, string>>;

const narrow: Spans = { 1: "col-span-1", 2: "col-span-2" };
const from576: Spans = { 1: "@xl/ui:col-span-1", 2: "@xl/ui:col-span-2" };
const from608: Spans = { 1: "@[38rem]/ui:col-span-1", 2: "@[38rem]/ui:col-span-2", 3: "@[38rem]/ui:col-span-3" };
const from896: Spans = { 1: "@4xl/ui:col-span-1", 2: "@4xl/ui:col-span-2", 3: "@4xl/ui:col-span-3", 4: "@4xl/ui:col-span-4" };

/** The width steps of a grid with `columns`, each with the columns it shows there (the steps of `gridColumns` in layout.tsx). */
function stepsOf(columns: number, narrowColumns: number): { shows: number; classes: Spans }[] {
  const steps = [{ shows: Math.min(narrowColumns, columns), classes: narrow }];
  if (columns >= 2) steps.push({ shows: 2, classes: from576 });
  if (columns === 3) steps.push({ shows: 3, classes: from608 });
  if (columns === 4) steps.push({ shows: 4, classes: from896 });
  return steps;
}

/** The classes for a child spanning `span` columns of a grid with `columns` (and `narrowColumns` on a phone), clamped at every width step. */
export function gridSpanClass(span: number | undefined, columns: number, narrowColumns = 1): string {
  const wanted = Math.max(1, Math.floor(span ?? 1));
  return stepsOf(columns, narrowColumns).map((step) => step.classes[Math.min(wanted, step.shows)] ?? "").join(" ");
}
