/** What a CSV column holds, read from its values. */
export type ColumnType = "number" | "date" | "text";

/** Digits with optional thousands commas, decimals, sign, a currency mark, or a trailing percent. */
const numberPattern = /^([-+]?)[$€£]?(\d{1,3}(?:,\d{3})+|\d*)(\.\d+)?%?$/;
/** ISO dates such as 2026-11-07 or 2026-11-07T09:30:00Z, and 2026/11/07. */
const datePattern = /^\d{4}([-/])\d{1,2}\1\d{1,2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * The number a cell holds, or null. Reads plain and scientific numbers,
 * thousands commas ("1,234.5"), a leading currency mark ("$12"), and a
 * trailing percent ("12%" reads as 12). Blank cells are null.
 */
export function parseNumber(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const plain = Number(text);
  if (Number.isFinite(plain)) return plain;
  const match = numberPattern.exec(text);
  if (!match) return null;
  const [, sign = "", whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") return null;
  const parsed = Number(`${sign}${whole.replaceAll(",", "")}${fraction}`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The time a cell holds, in milliseconds since 1970, or null. Only
 * unambiguous year-first dates count, so "03/04/2026" stays text.
 */
export function parseDate(value: string): number | null {
  const text = value.trim();
  if (!datePattern.test(text)) return null;
  const time = Date.parse(text.replaceAll("/", "-"));
  return Number.isNaN(time) ? null : time;
}

/**
 * A column's type from its values: "number" when every non-blank value is a
 * number, "date" when every one is a date, and "text" otherwise or when the
 * column is blank.
 */
export function detectColumnType(values: Iterable<string>): ColumnType {
  let numbers = true;
  let dates = true;
  let seen = false;
  for (const value of values) {
    if (value.trim() === "") continue;
    seen = true;
    numbers &&= parseNumber(value) !== null;
    dates &&= parseDate(value) !== null;
    if (!numbers && !dates) return "text";
  }
  if (!seen) return "text";
  return numbers ? "number" : "date";
}

/** Every column's type. `rows` may be ragged; a missing cell counts as blank. */
export function detectColumnTypes(rows: readonly (readonly string[])[], columnCount: number): ColumnType[] {
  return Array.from({ length: columnCount }, (_, column) => detectColumnType(rows.map((row) => row[column] ?? "")));
}
