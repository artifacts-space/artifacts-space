import { z } from "zod";

import { isTimeZone, parseIsoDate, parseIsoMonth, parseIsoTime } from "../calendar-dates";
import type { PropCheck } from "./data";
import { label, prose, tone } from "./shared";

/**
 * Props for planning components: Board (a read-only status board) and
 * Calendar (dated events). Dates are ISO strings, checked here so a bad
 * date never reaches the renderer.
 */

/** Most cards one Board may hold across all columns. */
export const maxBoardCards = 500;

const isoDate = z
  .string()
  .max(10)
  .refine((value) => parseIsoDate(value) !== null, "Use an ISO date such as 2026-11-06 (year-month-day, a real calendar date).");

const isoTime = z
  .string()
  .max(40)
  .refine(
    (value) => parseIsoTime(value) !== null,
    "Use an ISO date such as 2026-11-06, or a date and time such as 2026-11-06T15:30 (as written) or 2026-11-06T15:30:00Z / 2026-11-06T15:30:00-05:00 (moved into `timeZone`).",
  );

const boardBadge = z.object({
  label: label(40),
  tone: tone.optional(),
});

const boardCard = z.object({
  title: label(200),
  body: prose(500).optional(),
  tone: tone.optional(),
  badges: z.array(boardBadge).max(4).optional(),
  owner: label(60).optional(),
  due: isoDate.optional(),
});

const boardColumn = z.object({
  title: label(80),
  tone: tone.optional(),
  count: z.number().int().min(0).max(1_000_000).optional(),
  cards: z.array(boardCard).max(200),
});

const calendarEvent = z.object({
  title: label(160),
  start: isoTime,
  end: isoTime.optional(),
  allDay: z.boolean().optional(),
  tone: tone.optional(),
  note: label(300).optional(),
});

export const planningProps = {
  Board: z.object({
    title: label(160).optional(),
    columns: z.array(boardColumn).min(1).max(12),
  }),
  Calendar: z.object({
    title: label(160).optional(),
    view: z.enum(["agenda", "month"]).optional(),
    month: z
      .string()
      .max(7)
      .refine((value) => parseIsoMonth(value) !== null, "Use a year and month such as 2026-11.")
      .optional(),
    timeZone: z
      .string()
      .max(64)
      .refine(isTimeZone, "Use an IANA time zone name such as America/New_York, Europe/Berlin, or UTC.")
      .optional(),
    weekStart: z.enum(["sunday", "monday"]).optional(),
    events: z.array(calendarEvent).max(500),
  }),
};

type BoardProps = z.output<typeof planningProps.Board>;
type CalendarProps = z.output<typeof planningProps.Calendar>;

function boardCheck(props: Record<string, unknown>): string[] {
  const parsed = planningProps.Board.safeParse(props);
  if (!parsed.success) return [];
  const board: BoardProps = parsed.data;
  const total = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
  const problems = total > maxBoardCards ? [`The board has ${String(total)} cards; the limit is ${String(maxBoardCards)}. Split it into several boards or summarize done work.`] : [];
  board.columns.forEach((column, index) => {
    if (column.count !== undefined && column.count < column.cards.length) {
      problems.push(`columns[${String(index)}] ("${column.title}") has count ${String(column.count)} but shows ${String(column.cards.length)} cards. Leave count out to show the number of cards, or set it to the full total when the column shows only some of them.`);
    }
  });
  return problems;
}

type CalendarEvent = CalendarProps["events"][number];

function eventProblem(event: CalendarEvent, index: number): string | null {
  if (event.end === undefined) return null;
  const start = parseIsoTime(event.start);
  const end = parseIsoTime(event.end);
  if (!start || !end) return null;
  const where = `events[${String(index)}] ("${event.title}")`;
  if ((start.minute === null) !== (end.minute === null)) {
    return `${where}: start and end must both be dates (2026-11-06) or both be dates with times (2026-11-06T15:30). For an all-day event, use dates for both.`;
  }
  const startAt = start.day * 1440 + (start.minute ?? 0) - (start.offset ?? 0);
  const endAt = end.day * 1440 + (end.minute ?? 0) - (end.offset ?? 0);
  return endAt < startAt ? `${where}: end (${event.end}) is before start (${event.start}). Swap them or fix the date.` : null;
}

function calendarCheck(props: Record<string, unknown>): string[] {
  const parsed = planningProps.Calendar.safeParse(props);
  if (!parsed.success) return [];
  return parsed.data.events.flatMap((event, index) => eventProblem(event, index) ?? []);
}

/** Cross-field rules for planning components. */
export const planningChecks: Partial<Record<keyof typeof planningProps, PropCheck>> = {
  Board: boardCheck,
  Calendar: calendarCheck,
};

/** Agent-facing descriptions, for the catalog and guide. */
export const planningDescriptions = {
  Board: [
    "A read-only status board (kanban). `columns` (1-12) each have a `title`, optional `tone`, optional `count` (shown instead of the card count when the column lists only some cards), and `cards`.",
    "A card has a `title`, optional short `body`, `tone`, up to 4 `badges` ({ label, tone }), `owner`, and `due` (ISO date such as 2026-11-06).",
    `Up to ${String(maxBoardCards)} cards in all. Phones scroll the columns sideways inside the board.`,
  ].join(" "),
  Calendar: [
    "Dated events. `view`: agenda (default; a list grouped by day) or month (a month grid; narrow screens show that month as a list).",
    "Each event has a `title`, `start`, optional `end`, `allDay`, `tone`, and a short `note`.",
    "Dates are ISO: 2026-11-06 for all-day (an all-day `end` date is included), 2026-11-06T15:30 for a time.",
    "Times show as written unless you set `timeZone` (IANA, such as America/New_York): then times with Z or an offset move into that zone. The viewer's own time zone is never used.",
    "`month` (2026-11) picks the month the month view opens on; by default it opens on the first event's month. `weekStart`: sunday (default) or monday.",
  ].join(" "),
} as const;
