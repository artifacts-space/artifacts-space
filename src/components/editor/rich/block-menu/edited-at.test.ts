import { describe, expect, it } from "vitest";

import { formatCounts, formatEditedAt } from "./edited-at";

const now = new Date("2026-11-11T18:30:00Z");
const zone = "America/New_York";

describe("formatEditedAt", () => {
  it("should say Today or Yesterday with the time when it was recent", () => {
    expect(formatEditedAt(new Date("2026-11-11T18:15:00Z"), now, zone)).toBe("Today at 1:15 PM");
    expect(formatEditedAt(new Date("2026-11-10T14:02:00Z"), now, zone)).toBe("Yesterday at 9:02 AM");
  });

  it("should give the date and time earlier this year, and the date alone in another year", () => {
    expect(formatEditedAt(new Date("2026-11-03T21:30:00Z"), now, zone)).toBe("Nov 3 at 4:30 PM");
    expect(formatEditedAt(new Date("2025-11-03T21:30:00Z"), now, zone)).toBe("Nov 3, 2025");
  });

  it("should use the reader's day, not UTC's, when deciding Today", () => {
    expect(formatEditedAt(new Date("2026-11-11T03:00:00Z"), now, zone)).toBe("Yesterday at 10:00 PM");
  });
});

describe("formatCounts", () => {
  it("should use singular and plural words", () => {
    expect(formatCounts(1, 1)).toBe("1 word, 1 character");
    expect(formatCounts(0, 0)).toBe("0 words, 0 characters");
    expect(formatCounts(1200, 6400)).toBe("1,200 words, 6,400 characters");
  });
});
