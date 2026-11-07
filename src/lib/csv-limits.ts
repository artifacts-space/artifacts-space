/** Rows the CSV viewer shows before it cuts the rest, with a note. */
export const csvRowCap = 1000;

/** Columns the CSV viewer shows before it cuts the rest, with a note. */
export const csvColumnCap = 50;

/**
 * The largest CSV the grid editor opens. Bigger files open in the Raw editor,
 * so no row or column is ever dropped on save.
 */
export const csvGridEditLimits = { rows: 5000, columns: 100 } as const;
