import { z } from "zod";

/**
 * Turning stored daily counts into what the Views dialog and the MCP tool
 * show. Pure: no database, no clock (the caller passes today). Safe to
 * import from client components.
 */

/** The ranges people can pick, in days. */
export const viewRanges = [30, 90] as const;
export type ViewRange = (typeof viewRanges)[number];

/** Validates a requested range; anything else is refused. */
export const viewRangeSchema = z.union([z.literal(30), z.literal(90)]);

/** Top referrer domains shown. */
export const topReferrerCount = 10;

/** One stored day. */
export interface ViewDayRow {
  day: string;
  views: number;
  visitors: number;
}

/** One referrer domain with its views over the range. */
export interface ReferrerRow {
  domain: string;
  views: number;
}

/** What people who can edit an artifact see about its readers. */
export interface ViewStats {
  /** The range in days, ending today (UTC). */
  days: ViewRange;
  /** Whether views are counted now: the artifact is public. */
  counting: boolean;
  /** Views and daily unique visitors summed over the range. A visitor counts once a day. */
  totals: { views: number; visitors: number };
  /** One entry per day of the range, oldest first, zeros included. */
  daily: ViewDayRow[];
  /** Referring domains, most views first. */
  referrers: ReferrerRow[];
}

const dayMs = 86_400_000;

/** The date `offset` days after `day` (both YYYY-MM-DD, UTC). */
function addDays(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * dayMs).toISOString().slice(0, 10);
}

/** The first day of a range of `days` days that ends on `today`. */
export function rangeStart(today: string, days: number): string {
  return addDays(today, -(days - 1));
}

/** Every day of the range, oldest first. */
export function rangeDays(today: string, days: number): string[] {
  const start = rangeStart(today, days);
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

/**
 * The stats for a range: every day filled in (missing days are zero), rows
 * outside the range dropped, totals summed, and the top referrer domains.
 */
export function buildViewStats(input: { rows: readonly ViewDayRow[]; referrers: readonly ReferrerRow[]; today: string; days: ViewRange; counting: boolean }): ViewStats {
  const byDay = new Map(input.rows.map((row) => [row.day, row]));
  const daily = rangeDays(input.today, input.days).map((day) => ({ day, views: byDay.get(day)?.views ?? 0, visitors: byDay.get(day)?.visitors ?? 0 }));
  const totals = daily.reduce((sum, row) => ({ views: sum.views + row.views, visitors: sum.visitors + row.visitors }), { views: 0, visitors: 0 });
  const referrers = [...input.referrers].sort((a, b) => b.views - a.views || a.domain.localeCompare(b.domain)).slice(0, topReferrerCount);
  return { days: input.days, counting: input.counting, totals, daily, referrers };
}

const dayLabelFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Nov 8" for 2026-11-08, for chart labels. */
export function dayLabel(day: string): string {
  return dayLabelFormat.format(new Date(`${day}T00:00:00Z`));
}
