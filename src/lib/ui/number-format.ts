import type { CellFormat, CellValue, NumberFormat } from "./props/shared";

/**
 * Number display rules, shared by Table, KeyValue, Metric, and every chart.
 *
 * - Whole amounts show no decimals: $83, $1,430, 12%.
 * - Other amounts show the currency's minor unit (cents: $28.50) or, for
 *   plain numbers and percents, up to two decimals (2.5, 12.75%).
 * - A non-zero amount smaller than one minor unit (one cent) keeps two
 *   significant digits ($0.004, $0.0042), so it never shows as $0.00 and
 *   never rounds up to a whole cent it is not.
 * - A set of values read together (a table column, an axis, a chart's
 *   values) shares one decimal count, so the numbers line up: $83.00 beside
 *   $28.50. Sub-cent values keep their extra digits even then, because
 *   honesty beats alignment.
 */

/** Shown in place of a missing or unusable number. */
export const missingValue = "—";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat | null {
  const cached = formatters.get(key);
  if (cached) return cached;
  try {
    const created = new Intl.NumberFormat("en-US", options);
    formatters.set(key, created);
    return created;
  } catch {
    return null;
  }
}

/** Numbers this large switch to scientific notation, where grouping stops being readable. */
const hugeThreshold = 1e15;
/** Intl's portable ceiling for fraction digits. Two significant digits fit down to 1e-19. */
const maxFractionDigits = 20;
/** Decimals for plain numbers and percents that are not whole. */
const numberDecimals = 2;

/** The minor-unit digits of a currency (2 for USD, 0 for JPY), or null when the code is unknown. */
function currencyDigits(code: string): number | null {
  const resolved = formatter(`currency:${code}`, { style: "currency", currency: code })?.resolvedOptions();
  if (!resolved) return null;
  return resolved.maximumFractionDigits ?? 2;
}

/** The decimals a "normal" value of this format uses: the currency's minor unit, or two. */
function unitDigits(format: NumberFormat, currencyCode: string): number {
  return format === "currency" ? (currencyDigits(currencyCode.toUpperCase()) ?? 2) : numberDecimals;
}

/** Fraction digits that keep two significant digits of a small value: 0.004 → 3, 0.00437 → 4. */
function significantDigits(abs: number): number {
  let digits = Math.min(maxFractionDigits, Math.floor(-Math.log10(abs)) + 2);
  const rounded = Number(abs.toFixed(digits));
  while (digits > 0 && Number(rounded.toFixed(digits - 1)) === rounded) digits -= 1;
  return digits;
}

/** Decimals a normal-sized value needs at `unit` digits: none when whole, else as few as show it. */
function trimmedDigits(abs: number, unit: number, trim: boolean): number {
  const rounded = Number(abs.toFixed(unit));
  if (Number.isInteger(rounded)) return 0;
  if (!trim) return unit;
  let digits = unit;
  while (digits > 0 && Number(rounded.toFixed(digits - 1)) === rounded) digits -= 1;
  return digits;
}

interface DigitNeed {
  /** What this value asks of a shared column. */
  shared: number;
  /** What this value needs to stay honest on its own. */
  own: number;
}

function digitNeed(value: number, format: NumberFormat, currencyCode: string): DigitNeed {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs) || abs === 0 || abs >= hugeThreshold) return { shared: 0, own: 0 };
  const unit = unitDigits(format, currencyCode);
  // Smaller than one minor unit: keep significant digits so it never rounds to zero or up to a unit it is not.
  if (abs < 10 ** -unit) return { shared: unit, own: Math.max(unit, significantDigits(abs)) };
  // Currency shows its minor unit in full ($28.50); plain numbers trim trailing zeros (2.5).
  const digits = trimmedDigits(abs, unit, format !== "currency");
  return { shared: digits, own: digits };
}

/**
 * The decimal count a set of values shares (a table column, an axis, a
 * chart's values), so the numbers line up. Missing values are skipped.
 */
export function sharedFractionDigits(values: Iterable<number | null | undefined>, format: NumberFormat, currencyCode = "USD"): number {
  if (format === "compact") return 0;
  let digits = 0;
  for (const value of values) {
    if (typeof value === "number") digits = Math.max(digits, digitNeed(value, format, currencyCode).shared);
  }
  return digits;
}

function fixed(value: number, digits: number): string {
  return formatter(`number:${String(digits)}`, { minimumFractionDigits: digits, maximumFractionDigits: digits })?.format(value) ?? value.toFixed(digits);
}

function plain(value: number, format: NumberFormat, shared: number): string {
  if (Math.abs(value) >= hugeThreshold) return value.toExponential(2);
  return fixed(value, Math.max(shared, digitNeed(value, format, "USD").own));
}

function compact(value: number): string {
  if (Math.abs(value) >= hugeThreshold) return value.toExponential(2);
  // Compact notation rounds 0.004 to "0"; small values use the plain rules instead.
  if (Math.abs(value) < 1) return plain(value, "number", 0);
  return formatter("compact", { notation: "compact", maximumFractionDigits: 1 })?.format(value) ?? plain(value, "number", 0);
}

function currency(value: number, code: string, shared: number): string {
  const upper = code.toUpperCase();
  if (Math.abs(value) >= hugeThreshold) return `${upper} ${value.toExponential(2)}`;
  const digits = Math.max(shared, digitNeed(value, "currency", upper).own);
  const options: Intl.NumberFormatOptions = { style: "currency", currency: upper, minimumFractionDigits: digits, maximumFractionDigits: digits };
  return formatter(`currency:${upper}:${String(digits)}`, options)?.format(value) ?? `${upper} ${fixed(value, digits)}`;
}

/**
 * Formats a number for display by the rules at the top of this file.
 * `percent` treats the value as a percentage already (12.5 shows as 12.5%).
 * Pass `shared` from sharedFractionDigits() when the value sits in a column
 * or on an axis with others. Never throws: non-finite values show a dash,
 * huge values switch to scientific notation, and an unknown currency code
 * falls back to "CODE 1,234".
 */
export function formatNumber(value: number, format: NumberFormat = "number", currencyCode = "USD", shared = 0): string {
  if (!Number.isFinite(value)) return missingValue;
  switch (format) {
    case "compact":
      return compact(value);
    case "percent":
      return `${plain(value, "percent", shared)}%`;
    case "currency":
      return currency(value, currencyCode, shared);
    default:
      return plain(value, "number", shared);
  }
}

/**
 * Formats a table cell or key-value value: empty shows a dash, yes/no for
 * booleans, numbers by `format` ("text" shows them as written), text as is.
 * `shared` is the column's decimal count from sharedFractionDigits().
 */
export function formatCellValue(value: CellValue | undefined, format: CellFormat, currencyCode: string, shared = 0): string {
  if (value === null || value === undefined || value === "") return missingValue;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return format === "text" ? String(value) : formatNumber(value, format, currencyCode, shared);
  return value;
}
