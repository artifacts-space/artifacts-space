import { describe, expect, it } from "vitest";

import {
  dayNumber,
  dayParts,
  formatClock,
  formatLongDay,
  formatMonth,
  formatShortDate,
  isTimeZone,
  isoWallText,
  parseIsoDate,
  parseIsoMonth,
  parseIsoTime,
  toWallTime,
} from "./calendar-dates";

const nov6 = dayNumber(2026, 11, 6);

describe("parseIsoTime", () => {
  it("should read a date as a day with no time when only a date is written", () => {
    expect(parseIsoTime("2026-11-06")).toEqual({ day: nov6, minute: null, offset: null });
  });

  it("should keep a floating time when no zone is written", () => {
    expect(parseIsoTime("2026-11-06T15:30")).toEqual({ day: nov6, minute: 930, offset: null });
  });

  it("should read Z and offsets as minutes east of UTC", () => {
    expect(parseIsoTime("2026-11-06T15:30:00Z")?.offset).toBe(0);
    expect(parseIsoTime("2026-11-06T15:30:00.123-05:00")?.offset).toBe(-300);
    expect(parseIsoTime("2026-11-06T15:30+05:45")?.offset).toBe(345);
  });

  it("should reject dates that are not on the calendar", () => {
    for (const text of ["2026-02-29", "2026-13-01", "2026-11-31", "2026-00-10", "0999-01-01"]) expect(parseIsoTime(text)).toBeNull();
  });

  it("should accept a leap day when the year has one", () => {
    expect(parseIsoTime("2028-02-29")).not.toBeNull();
  });

  it("should reject impossible clocks and offsets", () => {
    for (const text of ["2026-11-06T24:00", "2026-11-06T10:60", "2026-11-06T10:00:61", "2026-11-06T10:00+15:00", "2026-11-06 10:00", "Nov 6", "2026-11-06T10"]) {
      expect(parseIsoTime(text)).toBeNull();
    }
  });
});

describe("parseIsoDate and parseIsoMonth", () => {
  it("should reject a date-time when only a date is allowed", () => {
    expect(parseIsoDate("2026-11-06")).toBe(nov6);
    expect(parseIsoDate("2026-11-06T10:00")).toBeNull();
  });

  it("should give a month index when the month is real", () => {
    expect(parseIsoMonth("2026-11")).toBe(2026 * 12 + 10);
    expect(parseIsoMonth("2026-13")).toBeNull();
    expect(parseIsoMonth("2026-1")).toBeNull();
  });
});

describe("toWallTime", () => {
  it("should show a time as written when no time zone is set", () => {
    const time = parseIsoTime("2026-11-13T03:30:00Z");
    expect(time && toWallTime(time, undefined)).toEqual({ day: dayNumber(2026, 11, 13), minute: 210 });
  });

  it("should move a UTC time into the time zone when one is set", () => {
    const time = parseIsoTime("2026-11-13T03:30:00Z");
    expect(time && toWallTime(time, "America/New_York")).toEqual({ day: dayNumber(2026, 11, 12), minute: 22 * 60 + 30 });
  });

  it("should follow daylight saving when the zone changes its offset", () => {
    const summer = parseIsoTime("2026-07-01T12:00:00Z");
    expect(summer && toWallTime(summer, "America/New_York").minute).toBe(8 * 60);
  });

  it("should leave floating times and dates alone when a time zone is set", () => {
    const floating = parseIsoTime("2026-11-06T09:00");
    const date = parseIsoTime("2026-11-06");
    expect(floating && toWallTime(floating, "Asia/Tokyo")).toEqual({ day: nov6, minute: 540 });
    expect(date && toWallTime(date, "Asia/Tokyo")).toEqual({ day: nov6, minute: null });
  });

  it("should move across a day forward when the zone is east of the offset", () => {
    const time = parseIsoTime("2026-11-06T20:00:00-05:00");
    expect(time && toWallTime(time, "Asia/Tokyo")).toEqual({ day: dayNumber(2026, 11, 7), minute: 10 * 60 });
  });
});

describe("isTimeZone", () => {
  it("should accept IANA names and reject anything else", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("formatting", () => {
  it("should format days with fixed English names when shown", () => {
    expect(formatLongDay(nov6)).toBe("Fri, Nov 6, 2026");
    expect(formatShortDate(nov6)).toBe("Nov 6");
    expect(formatMonth(2026 * 12 + 10)).toBe("November 2026");
  });

  it("should format clocks in 12-hour time when shown", () => {
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60 + 5)).toBe("12:05 PM");
    expect(formatClock(23 * 60 + 59)).toBe("11:59 PM");
  });

  it("should round-trip a day number to its parts", () => {
    expect(dayParts(nov6)).toEqual({ year: 2026, month: 11, date: 6, weekday: 5 });
    expect(dayParts(dayNumber(1969, 12, 31)).weekday).toBe(3);
  });

  it("should write machine-readable dates when a time element needs one", () => {
    expect(isoWallText({ day: nov6, minute: null })).toBe("2026-11-06");
    expect(isoWallText({ day: nov6, minute: 65 })).toBe("2026-11-06T01:05");
  });
});
