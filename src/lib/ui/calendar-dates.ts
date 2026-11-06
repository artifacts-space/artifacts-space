/**
 * Date math for Calendar and Board, with no viewer time zone anywhere. A date
 * is a day number (days since 1970-01-01) and a time is minutes since
 * midnight, both read straight from the ISO text. Only a spec's declared
 * `timeZone` moves a time, and that uses Intl with a fixed zone, so the
 * server and the browser compute the same wall clock. Display strings come
 * from fixed English names, not Intl, so ICU differences cannot cause a
 * hydration mismatch.
 */

const msPerDay = 86_400_000;
const msPerMinute = 60_000;

/** An ISO date or date-time as written. `minute` is null for a date; `offset` (minutes east of UTC) is null when no zone was written. */
export interface IsoTime {
  day: number;
  minute: number | null;
  offset: number | null;
}

/** A wall-clock moment in the calendar's display zone. */
export interface WallTime {
  day: number;
  minute: number | null;
}

const isoPattern = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthPattern = /^(\d{4})-(\d{2})$/;

/** Days in a month (1-12) of a year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The day number of a calendar date. */
export function dayNumber(year: number, month: number, date: number): number {
  return Date.UTC(year, month - 1, date) / msPerDay;
}

function validDate(year: number, month: number, date: number): boolean {
  return year >= 1000 && month >= 1 && month <= 12 && date >= 1 && date <= daysInMonth(year, month);
}

function parseOffset(text: string | undefined): number | null | undefined {
  if (text === undefined) return null;
  if (text === "Z") return 0;
  const sign = text.startsWith("-") ? -1 : 1;
  const hours = Number(text.slice(1, 3));
  const minutes = Number(text.slice(4, 6));
  if (hours > 14 || minutes > 59) return undefined;
  return sign * (hours * 60 + minutes);
}

function parseClock(hour: string | undefined, minute: string | undefined, second: string | undefined): number | null | undefined {
  if (hour === undefined || minute === undefined) return null;
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59 || Number(second ?? "0") > 59) return undefined;
  return h * 60 + m;
}

/** Parses an ISO date ("2026-11-06") or date-time ("2026-11-06T15:30", "…:00Z", "…+02:00"). Null when it is not a real date. */
export function parseIsoTime(text: string): IsoTime | null {
  const match = isoPattern.exec(text);
  if (!match) return null;
  const [, year, month, date, hour, minute, second, zone] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(date);
  if (!validDate(y, m, d)) return null;
  const clock = parseClock(hour, minute, second);
  const offset = parseOffset(zone);
  if (clock === undefined || offset === undefined) return null;
  return { day: dayNumber(y, m, d), minute: clock, offset };
}

/** Parses an ISO date with no time ("2026-11-06") to a day number, or null. */
export function parseIsoDate(text: string): number | null {
  if (!datePattern.test(text)) return null;
  return parseIsoTime(text)?.day ?? null;
}

/** Parses "2026-11" to a month index (year * 12 + month - 1), or null. */
export function parseIsoMonth(text: string): number | null {
  const match = monthPattern.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1000 || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  if (zoneFormatters.has(timeZone)) return zoneFormatters.get(timeZone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  } catch {
    formatter = null;
  }
  if (zoneFormatters.size < 100) zoneFormatters.set(timeZone, formatter);
  return formatter;
}

/** True when `timeZone` is an IANA time zone this runtime knows, such as "America/New_York". */
export function isTimeZone(timeZone: string): boolean {
  return timeZone.length > 0 && zoneFormatter(timeZone) !== null;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((item) => item.type === type)?.value ?? "0");
}

/**
 * The wall clock to show for a parsed time. Dates, times written without a
 * zone, and every time when no `timeZone` is set show as written. A time
 * with Z or an offset moves into `timeZone` when one is set.
 */
export function toWallTime(time: IsoTime, timeZone: string | undefined): WallTime {
  const formatter = timeZone === undefined ? null : zoneFormatter(timeZone);
  if (time.minute === null || time.offset === null || formatter === null) return { day: time.day, minute: time.minute };
  const instant = time.day * msPerDay + (time.minute - time.offset) * msPerMinute;
  const parts = formatter.formatToParts(instant);
  const hour = part(parts, "hour") % 24;
  return { day: dayNumber(part(parts, "year"), part(parts, "month"), part(parts, "day")), minute: hour * 60 + part(parts, "minute") };
}

/** The calendar date of a day number. `weekday` is 0 for Sunday. */
export function dayParts(day: number): { year: number; month: number; date: number; weekday: number } {
  const value = new Date(day * msPerDay);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, date: value.getUTCDate(), weekday: value.getUTCDay() };
}

/** The month index (year * 12 + month - 1) a day falls in. */
export function monthOfDay(day: number): number {
  const { year, month } = dayParts(day);
  return year * 12 + month - 1;
}

/** The first day number of a month index. */
export function firstDayOfMonth(monthIndex: number): number {
  return dayNumber(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 1);
}

/** The last day number of a month index. */
export function lastDayOfMonth(monthIndex: number): number {
  return firstDayOfMonth(monthIndex + 1) - 1;
}

export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const short = (name: string) => name.slice(0, 3);

/** "November 2026". */
export function formatMonth(monthIndex: number): string {
  return `${monthNames[monthIndex % 12] ?? ""} ${String(Math.floor(monthIndex / 12))}`;
}

/** "Nov 6", or "Nov 6, 2026" with the year. */
export function formatShortDate(day: number, withYear = false): string {
  const { year, month, date } = dayParts(day);
  const text = `${short(monthNames[month - 1] ?? "")} ${String(date)}`;
  return withYear ? `${text}, ${String(year)}` : text;
}

/** "Fri, Nov 6, 2026". */
export function formatLongDay(day: number): string {
  return `${short(weekdayNames[dayParts(day).weekday] ?? "")}, ${formatShortDate(day, true)}`;
}

/** "3:05 PM" from minutes since midnight. */
export function formatClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12)}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "2026-11-06" or "2026-11-06T15:05", for a `<time dateTime>` attribute. */
export function isoWallText(time: WallTime): string {
  const { year, month, date } = dayParts(time.day);
  const text = `${String(year)}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  if (time.minute === null) return text;
  return `${text}T${String(Math.floor(time.minute / 60)).padStart(2, "0")}:${String(time.minute % 60).padStart(2, "0")}`;
}
