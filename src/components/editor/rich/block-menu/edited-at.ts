/*
 * The time in the block menu's footer, as a calendar reads it: "Today at
 * 1:15 PM", "Yesterday at 9:02 AM", "Nov 3 at 4:30 PM", or "Nov 3, 2025"
 * in another year. The menu only renders in the browser, so it uses the
 * reader's own time zone; tests pass one.
 */

function dayKey(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/** "Today at 1:15 PM" and so on; see the notes at the top of this file. */
export function formatEditedAt(at: Date, now: Date, timeZone?: string): string {
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(at);
  const day = dayKey(at, timeZone);
  if (day === dayKey(now, timeZone)) return `Today at ${time}`;
  if (day === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return `Yesterday at ${time}`;
  const sameYear = day.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  if (sameYear) return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(at)} at ${time}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(at);
}

/** "1 word, 5 characters" with the right plurals. */
export function formatCounts(words: number, characters: number): string {
  return `${words.toLocaleString("en-US")} ${words === 1 ? "word" : "words"}, ${characters.toLocaleString("en-US")} ${characters === 1 ? "character" : "characters"}`;
}
