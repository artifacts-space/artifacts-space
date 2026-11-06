import { describe, expect, it } from "vitest";

import { formatExactTime, formatRelativeTime, formatSize } from "./relative-time";

const now = new Date("2026-11-06T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("formatRelativeTime", () => {
  it("should say just now when under a minute or in the future", () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(-5_000), now)).toBe("just now");
  });

  it("should count minutes, hours, and days when recent", () => {
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(formatRelativeTime(ago(2 * 3_600_000 + 1), now)).toBe("2h ago");
    expect(formatRelativeTime(ago(3 * 86_400_000), now)).toBe("3d ago");
  });

  it("should show a date when a week or more has passed", () => {
    expect(formatRelativeTime(new Date("2026-10-01T09:00:00Z"), now)).toBe("Oct 1");
    expect(formatRelativeTime(new Date("2025-10-01T09:00:00Z"), now)).toBe("Oct 1, 2025");
  });
});

describe("formatExactTime", () => {
  it("should show the date and UTC time when given a moment", () => {
    expect(formatExactTime(new Date("2026-11-06T09:05:00Z"))).toBe("Nov 6, 2026, 09:05 UTC");
  });
});

describe("formatSize", () => {
  it("should use B, KB, and MB when sizes grow", () => {
    expect(formatSize(820)).toBe("820 B");
    expect(formatSize(2400)).toBe("2.4 KB");
    expect(formatSize(1_200_000)).toBe("1.2 MB");
  });
});
