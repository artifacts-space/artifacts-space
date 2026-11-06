import type { NumberFormat } from "./props/shared";

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

function plain(value: number): string {
  if (Math.abs(value) >= hugeThreshold) return value.toExponential(2);
  return formatter("number", { maximumFractionDigits: 2 })?.format(value) ?? String(value);
}

function compact(value: number): string {
  if (Math.abs(value) >= hugeThreshold) return value.toExponential(2);
  return formatter("compact", { notation: "compact", maximumFractionDigits: 1 })?.format(value) ?? plain(value);
}

function currency(value: number, code: string): string {
  const upper = code.toUpperCase();
  if (Math.abs(value) >= hugeThreshold) return `${upper} ${value.toExponential(2)}`;
  const options: Intl.NumberFormatOptions = { style: "currency", currency: upper, maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 };
  return formatter(`currency:${upper}:${String(options.maximumFractionDigits)}`, options)?.format(value) ?? `${upper} ${plain(value)}`;
}

/**
 * Formats a number for display. `percent` treats the value as a percentage
 * already (12.5 shows as 12.5%). Never throws: non-finite values show a dash,
 * huge values switch to scientific notation, and an unknown currency code
 * falls back to "CODE 1,234".
 */
export function formatNumber(value: number, format: NumberFormat = "number", currencyCode = "USD"): string {
  if (!Number.isFinite(value)) return missingValue;
  switch (format) {
    case "compact":
      return compact(value);
    case "percent":
      return `${plain(value)}%`;
    case "currency":
      return currency(value, currencyCode);
    default:
      return plain(value);
  }
}
