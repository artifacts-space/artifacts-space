import { describe, expect, it } from "vitest";

import { dayNumber } from "./calendar-dates";
import { agendaDays, calendarEntries, entriesByDay, entryTimeLabel, monthRange, monthWeeks } from "./calendar-model";

const day = (month: number, date: number, year = 2026) => dayNumber(year, month, date);
const nov = 2026 * 12 + 10;

describe("calendarEntries", () => {
  it("should sort all-day events before timed ones on the same day", () => {
    const entries = calendarEntries([{ title: "b", start: "2026-11-06T09:00" }, { title: "a", start: "2026-11-06" }, { title: "c", start: "2026-11-05T23:00" }], undefined);
    expect(entries.map((entry) => entry.title)).toEqual(["c", "a", "b"]);
  });

  it("should treat a timed start as all-day when allDay is set", () => {
    const [entry] = calendarEntries([{ title: "x", start: "2026-11-06T09:00", allDay: true }], undefined);
    expect(entry?.allDay).toBe(true);
    expect(entry?.startMinute).toBeNull();
  });

  it("should include the end date when an all-day event spans days", () => {
    const [entry] = calendarEntries([{ title: "x", start: "2026-10-28", end: "2026-11-03" }], undefined);
    expect([entry?.startDay, entry?.endDay]).toEqual([day(10, 28), day(11, 3)]);
  });

  it("should not cover the end day when a timed event ends at midnight", () => {
    const [entry] = calendarEntries([{ title: "x", start: "2026-11-06T20:00", end: "2026-11-07T00:00" }], undefined);
    expect(entry?.endDay).toBe(day(11, 6));
    expect(entry && entryTimeLabel(entry)).toBe("8:00 PM – 12:00 AM");
  });

  it("should move events into the time zone when one is set", () => {
    const [entry] = calendarEntries([{ title: "x", start: "2026-11-13T03:30:00Z" }], "America/New_York");
    expect(entry?.startDay).toBe(day(11, 12));
  });
});

describe("entryTimeLabel", () => {
  const label = (start: string, end?: string) => {
    const [entry] = calendarEntries([{ title: "x", start, end }], undefined);
    return entry ? entryTimeLabel(entry) : "";
  };

  it("should say All day when a dated event has one day", () => {
    expect(label("2026-11-06")).toBe("All day");
  });

  it("should show a date range when an all-day event spans days", () => {
    expect(label("2026-11-06", "2026-11-08")).toBe("Nov 6 – Nov 8");
    expect(label("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
  });

  it("should show times when an event is timed", () => {
    expect(label("2026-11-06T15:00")).toBe("3:00 PM");
    expect(label("2026-11-06T15:00", "2026-11-06T16:30")).toBe("3:00 PM – 4:30 PM");
    expect(label("2026-11-06T21:00", "2026-11-07T01:00")).toBe("Nov 6, 9:00 PM – Nov 7, 1:00 AM");
  });
});

describe("agendaDays", () => {
  const entries = calendarEntries(
    [
      { title: "span", start: "2026-10-28", end: "2026-11-03" },
      { title: "one", start: "2026-11-02T09:00" },
      { title: "two", start: "2026-11-02T09:30" },
      { title: "dec", start: "2026-12-01" },
    ],
    undefined,
  );

  it("should list each event once on its start day when there is no window", () => {
    expect(agendaDays(entries).map((group) => [group.day, group.entries.map((entry) => entry.title)])).toEqual([
      [day(10, 28), ["span"]],
      [day(11, 2), ["one", "two"]],
      [day(12, 1), ["dec"]],
    ]);
  });

  it("should clip an earlier event to the window's first day when a window is given", () => {
    const groups = agendaDays(entries, { from: day(11, 1), to: day(11, 30) });
    expect(groups.map((group) => group.day)).toEqual([day(11, 1), day(11, 2)]);
  });
});

describe("monthWeeks", () => {
  it("should start on Sunday and cover every day when weekStart is Sunday", () => {
    const weeks = monthWeeks(nov, 0);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe(day(11, 1));
    expect(weeks.at(-1)?.[6]).toBe(day(12, 5));
  });

  it("should start on Monday and pad from October when weekStart is Monday", () => {
    const weeks = monthWeeks(nov, 1);
    expect(weeks[0]?.[0]).toBe(day(10, 26));
    expect(weeks).toHaveLength(6);
    expect(weeks.at(-1)?.[0]).toBe(day(11, 30));
  });

  it("should use four rows when February fits exactly", () => {
    expect(monthWeeks(2026 * 12 + 1, 0)).toHaveLength(4);
  });
});

describe("entriesByDay and monthRange", () => {
  const entries = calendarEntries([{ title: "span", start: "2026-10-28", end: "2026-11-03" }, { title: "late", start: "2027-01-05" }], undefined);

  it("should put a spanning event on each covered day inside the range", () => {
    const byDay = entriesByDay(entries, day(11, 1), day(11, 30));
    expect([...byDay.keys()]).toEqual([day(11, 1), day(11, 2), day(11, 3)]);
  });

  it("should open on the first event's month and allow every month up to the last event", () => {
    expect(monthRange(entries, undefined)).toEqual({ initial: 2026 * 12 + 9, first: 2026 * 12 + 9, last: 2027 * 12 });
  });

  it("should open on the chosen month when month is set", () => {
    expect(monthRange(entries, "2026-11")?.initial).toBe(nov);
    expect(monthRange([], "2026-02")).toEqual({ initial: 2026 * 12 + 1, first: 2026 * 12 + 1, last: 2026 * 12 + 1 });
    expect(monthRange([], undefined)).toBeNull();
  });
});
