import { dayParts, firstDayOfMonth, formatClock, formatShortDate, lastDayOfMonth, monthOfDay, parseIsoMonth, parseIsoTime, toWallTime } from "./calendar-dates";
import type { Tone } from "./props/shared";

/** A Calendar event as the props give it. */
export interface CalendarEventInput {
  title: string;
  start: string;
  end?: string | undefined;
  allDay?: boolean | undefined;
  tone?: Tone | undefined;
  note?: string | undefined;
}

/** An event placed on the calendar: wall-clock days and minutes in the display zone. */
export interface CalendarEntry {
  /** Position in the spec, used as a stable key and tie-breaker. */
  index: number;
  title: string;
  note: string | undefined;
  tone: Tone | undefined;
  allDay: boolean;
  startDay: number;
  /** The last day the event covers, inclusive. */
  endDay: number;
  startMinute: number | null;
  /** When a timed event ends, as written (the day may be one past endDay at midnight). Null for all-day events or no end. */
  endsAt: { day: number; minute: number } | null;
}

function lastCoveredDay(allDay: boolean, startDay: number, end: { day: number; minute: number | null } | null): number {
  if (!end) return startDay;
  // A timed event that ends exactly at midnight does not cover the day it ends on.
  const day = !allDay && end.minute === 0 && end.day > startDay ? end.day - 1 : end.day;
  return Math.max(startDay, day);
}

function timedEnd(allDay: boolean, end: { day: number; minute: number | null } | null): { day: number; minute: number } | null {
  if (allDay || end?.minute === undefined || end.minute === null) return null;
  return { day: end.day, minute: end.minute };
}

function toEntry(event: CalendarEventInput, index: number, timeZone: string | undefined): CalendarEntry | null {
  const startTime = parseIsoTime(event.start);
  if (!startTime) return null;
  const endTime = event.end === undefined ? null : parseIsoTime(event.end);
  const start = toWallTime(startTime, timeZone);
  const end = endTime ? toWallTime(endTime, timeZone) : null;
  const allDay = event.allDay === true || start.minute === null;
  return {
    index,
    title: event.title,
    note: event.note,
    tone: event.tone,
    allDay,
    startDay: start.day,
    endDay: lastCoveredDay(allDay, start.day, end),
    startMinute: allDay ? null : start.minute,
    endsAt: timedEnd(allDay, end),
  };
}

/** Sort order: by day, all-day first, then by start time, then as written. */
function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  return a.startDay - b.startDay || (a.startMinute ?? -1) - (b.startMinute ?? -1) || a.index - b.index;
}

/** Places every event in the display zone and sorts them. Events whose dates do not parse are left out (validation reports them). */
export function calendarEntries(events: readonly CalendarEventInput[], timeZone: string | undefined): CalendarEntry[] {
  return events.flatMap((event, index) => toEntry(event, index, timeZone) ?? []).sort(compareEntries);
}

/** One day of the agenda and the events listed under it. */
export interface AgendaDay {
  day: number;
  entries: CalendarEntry[];
}

/**
 * Groups entries by day for the agenda. Each event is listed once, on its
 * first day inside the window; a window clips events that started earlier
 * so they show on the window's first day.
 */
export function agendaDays(entries: readonly CalendarEntry[], window?: { from: number; to: number }): AgendaDay[] {
  const from = window?.from ?? Number.NEGATIVE_INFINITY;
  const to = window?.to ?? Number.POSITIVE_INFINITY;
  const byDay = new Map<number, CalendarEntry[]>();
  for (const entry of entries) {
    if (entry.endDay < from || entry.startDay > to) continue;
    const day = Math.max(entry.startDay, from);
    const list = byDay.get(day) ?? [];
    list.push(entry);
    byDay.set(day, list);
  }
  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([day, list]) => ({ day, entries: list }));
}

/** The months a month view can show: from the first event's month to the last's, widened to include `month`. */
export function monthRange(entries: readonly CalendarEntry[], month: string | undefined): { initial: number; first: number; last: number } | null {
  const chosen = month === undefined ? null : parseIsoMonth(month);
  const firstEntry = entries[0];
  if (!firstEntry) return chosen === null ? null : { initial: chosen, first: chosen, last: chosen };
  const firstMonth = monthOfDay(firstEntry.startDay);
  const lastMonth = monthOfDay(Math.max(...entries.map((entry) => entry.endDay)));
  const initial = chosen ?? firstMonth;
  return { initial, first: Math.min(initial, firstMonth), last: Math.max(initial, lastMonth) };
}

/** The weeks of a month grid: rows of seven day numbers, starting on Sunday (0) or Monday (1). */
export function monthWeeks(monthIndex: number, weekStart: 0 | 1): number[][] {
  const first = firstDayOfMonth(monthIndex);
  const last = lastDayOfMonth(monthIndex);
  const lead = (dayParts(first).weekday - weekStart + 7) % 7;
  const gridStart = first - lead;
  const weekCount = Math.ceil((last - gridStart + 1) / 7);
  return Array.from({ length: weekCount }, (_, week) => Array.from({ length: 7 }, (_, column) => gridStart + week * 7 + column));
}

/** The entries covering each day from `from` to `to`, inclusive, in sort order. */
export function entriesByDay(entries: readonly CalendarEntry[], from: number, to: number): Map<number, CalendarEntry[]> {
  const byDay = new Map<number, CalendarEntry[]>();
  for (const entry of entries) {
    for (let day = Math.max(entry.startDay, from); day <= Math.min(entry.endDay, to); day += 1) {
      const list = byDay.get(day) ?? [];
      list.push(entry);
      byDay.set(day, list);
    }
  }
  return byDay;
}

function rangeDate(day: number, otherDay: number): string {
  return formatShortDate(day, dayParts(day).year !== dayParts(otherDay).year);
}

/** When an event happens, for people: "All day", "3:00 PM – 4:30 PM", "Nov 6 – Nov 8", or "Nov 6, 9:00 PM – Nov 7, 1:00 AM". */
export function entryTimeLabel(entry: CalendarEntry): string {
  if (entry.allDay) {
    return entry.endDay > entry.startDay ? `${rangeDate(entry.startDay, entry.endDay)} – ${rangeDate(entry.endDay, entry.startDay)}` : "All day";
  }
  const start = formatClock(entry.startMinute ?? 0);
  const ends = entry.endsAt;
  if (!ends) return start;
  if (entry.endDay === entry.startDay) return `${start} – ${formatClock(ends.minute)}`;
  return `${rangeDate(entry.startDay, ends.day)}, ${start} – ${rangeDate(ends.day, entry.startDay)}, ${formatClock(ends.minute)}`;
}
