const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * A short "how long ago": "just now", "5 min ago", "2h ago", "3d ago", then
 * a date ("Nov 5", or "Nov 5, 2025" in another year). Future times (clock
 * skew) read as "just now".
 */
export function formatRelativeTime(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))}h ago`;
  if (elapsed < 7 * DAY) return `${String(Math.floor(elapsed / DAY))}d ago`;
  return at.getUTCFullYear() === now.getUTCFullYear() ? shortDate.format(at) : longDate.format(at);
}

/** An exact time for tooltips and titles, in UTC so the server and browser agree. */
export function formatExactTime(at: Date): string {
  return `${longDate.format(at)}, ${at.toISOString().slice(11, 16)} UTC`;
}

/** A byte count for people: "820 B", "2.4 KB", "1.2 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
