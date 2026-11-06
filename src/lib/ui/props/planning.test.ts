import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

function errors(type: string, props: Record<string, unknown>) {
  const spec = { version: 1, root: "e", elements: { e: { type, props } } };
  return validateUiSpec(spec).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("\n");
}

const card = (title: string) => ({ title });

describe("Board props", () => {
  it("should accept a board when columns hold cards with every optional field", () => {
    expect(errors("Board", { title: "Sprint", columns: [{ title: "To do", tone: "info", count: 3, cards: [{ title: "a", body: "b", tone: "warning", badges: [{ label: "bug", tone: "danger" }], owner: "Dana", due: "2026-11-06" }] }] })).toBe("");
  });

  it("should explain the date format when due is not an ISO date", () => {
    expect(errors("Board", { columns: [{ title: "x", cards: [{ title: "a", due: "Nov 6" }] }] })).toContain("2026-11-06");
    expect(errors("Board", { columns: [{ title: "x", cards: [{ title: "a", due: "2026-02-30" }] }] })).toContain("real calendar date");
  });

  it("should reject a board when it has no columns", () => {
    expect(errors("Board", { columns: [] })).toContain("props.columns");
  });

  it("should explain count when it is lower than the cards shown", () => {
    expect(errors("Board", { columns: [{ title: "Done", count: 1, cards: [card("a"), card("b")] }] })).toContain("Leave count out");
  });

  it("should name the limit when the board holds more than 500 cards", () => {
    const columns = Array.from({ length: 3 }, (_, index) => ({ title: `c${String(index)}`, cards: Array.from({ length: 200 }, (_, n) => card(String(n))) }));
    expect(errors("Board", { columns })).toContain("the limit is 500");
  });

  it("should refuse free-form colors when a tone is not one of the tones", () => {
    expect(errors("Board", { columns: [{ title: "x", tone: "#ff0000", cards: [] }] })).toContain("props.columns[0].tone");
  });
});

describe("Calendar props", () => {
  it("should accept dates, floating times, and zoned times when they are valid", () => {
    expect(errors("Calendar", { view: "month", month: "2026-11", timeZone: "Europe/Berlin", weekStart: "monday", events: [{ title: "a", start: "2026-11-06" }, { title: "b", start: "2026-11-06T09:00", end: "2026-11-06T10:00", tone: "info", note: "n" }, { title: "c", start: "2026-11-06T09:00:00Z", allDay: true }] })).toBe("");
  });

  it("should accept a calendar when it has no events", () => {
    expect(errors("Calendar", { events: [] })).toBe("");
  });

  it("should show the accepted formats when start is not ISO", () => {
    expect(errors("Calendar", { events: [{ title: "a", start: "11/06/2026" }] })).toContain("2026-11-06T15:30");
  });

  it("should reject an unknown time zone with examples", () => {
    expect(errors("Calendar", { timeZone: "EST5", events: [] })).toContain("America/New_York");
  });

  it("should reject a month when it is not year-month", () => {
    expect(errors("Calendar", { month: "November", events: [] })).toContain("2026-11");
  });

  it("should tell the agent to swap dates when end is before start", () => {
    expect(errors("Calendar", { events: [{ title: "Launch", start: "2026-11-06", end: "2026-11-05" }] })).toContain('events[0] ("Launch"): end (2026-11-05) is before start (2026-11-06)');
  });

  it("should compare instants when end and start use different offsets", () => {
    expect(errors("Calendar", { events: [{ title: "a", start: "2026-11-06T10:00:00+02:00", end: "2026-11-06T09:30:00Z" }] })).toBe("");
  });

  it("should ask for matching kinds when start is a date and end has a time", () => {
    expect(errors("Calendar", { events: [{ title: "a", start: "2026-11-06", end: "2026-11-07T10:00" }] })).toContain("both be dates");
  });
});
