import { describe, expect, it } from "vitest";

import { buildViewStats, dayLabel, rangeDays, rangeStart, topReferrerCount } from "./view-stats-rules";

describe("rangeStart and rangeDays", () => {
  it("should end the range on today when it spans 30 days", () => {
    expect(rangeStart("2026-11-08", 30)).toBe("2026-10-10");
    const days = rangeDays("2026-11-08", 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-10-10");
    expect(days.at(-1)).toBe("2026-11-08");
  });

  it("should cross month and year ends when the range does", () => {
    expect(rangeDays("2027-01-01", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("buildViewStats", () => {
  const base = { today: "2026-11-08", days: 30 as const, counting: true, referrers: [] };

  it("should fill missing days with zeros and sum the totals when only some days have views", () => {
    const stats = buildViewStats({ ...base, rows: [{ day: "2026-11-01", views: 5, visitors: 3 }, { day: "2026-11-08", views: 2, visitors: 2 }] });
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.find((row) => row.day === "2026-11-02")).toEqual({ day: "2026-11-02", views: 0, visitors: 0 });
    expect(stats.totals).toEqual({ views: 7, visitors: 5 });
  });

  it("should leave out days outside the range when the store returns them", () => {
    const stats = buildViewStats({ ...base, rows: [{ day: "2026-10-01", views: 100, visitors: 100 }] });
    expect(stats.totals).toEqual({ views: 0, visitors: 0 });
  });

  it("should list referrers most views first and keep only the top ones when there are many", () => {
    const referrers = Array.from({ length: 15 }, (_, index) => ({ domain: `site${String(index)}.example`, views: index }));
    const stats = buildViewStats({ ...base, rows: [], referrers });
    expect(stats.referrers).toHaveLength(topReferrerCount);
    expect(stats.referrers[0]).toEqual({ domain: "site14.example", views: 14 });
  });

  it("should say counting is off when the artifact is not public", () => {
    expect(buildViewStats({ ...base, counting: false, rows: [] }).counting).toBe(false);
  });
});

describe("dayLabel", () => {
  it("should show a short month and day when labelling the chart", () => {
    expect(dayLabel("2026-11-08")).toBe("Nov 8");
  });
});
