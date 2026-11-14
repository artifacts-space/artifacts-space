import type { ComponentFixture } from "./components";

const long = (length: number) => "Plans, owners, and dates the next session needs to see at a glance. ".repeat(Math.ceil(length / 68)).slice(0, length).trim();
const tones = ["neutral", "info", "success", "warning", "danger"] as const;

const sprint = [
  {
    title: "To do",
    cards: [
      { title: "Write the release notes", owner: "Dana", due: "2026-11-12" },
      { title: "Plan the Team billing page", body: "Seats, invoices, and the upgrade path.", badges: [{ label: "design", tone: "info" }] },
    ],
  },
  {
    title: "In progress",
    tone: "info",
    cards: [
      { title: "Calendar component", body: "Agenda by default; month grid on wide screens.", owner: "claude-opus", due: "2026-11-06", badges: [{ label: "catalog" }, { label: "ui", tone: "info" }] },
      { title: "Fix share dialog overflow", tone: "warning", badges: [{ label: "bug", tone: "danger" }], owner: "Sam" },
    ],
  },
  { title: "Review", tone: "warning", cards: [{ title: "Board component", owner: "claude-opus", due: "2026-11-07", tone: "info" }] },
  { title: "Done", tone: "success", count: 42, cards: [{ title: "Pie and donut charts", tone: "success" }, { title: "KeyValue and Steps" }] },
];

const fiftyCards = Array.from({ length: 8 }, (_, column) => ({
  title: column === 7 ? long(80) : `Stage ${String(column + 1)}`,
  tone: tones[column % tones.length],
  cards: Array.from({ length: column === 3 ? 0 : column < 3 ? 10 : 5 }, (_, card) => ({
    title: card === 0 ? long(200) : `Card ${String(column + 1)}.${String(card + 1)}`,
    ...(card % 3 === 0 ? { body: long(500) } : {}),
    ...(card % 4 === 1 ? { badges: [{ label: long(40), tone: "danger" }, { label: "x".repeat(40) }, { label: "ops" }, { label: "p1", tone: "warning" }] } : {}),
    ...(card % 2 === 0 ? { owner: long(60), due: "2026-12-31" } : {}),
    ...(card % 5 === 2 ? { tone: tones[card % tones.length], title: "x".repeat(200) } : {}),
  })),
}));

/** Normal and extreme Board fixtures. 8 columns hold 50 cards, with an empty column and text at every limit. */
export const boardFixtures: ComponentFixture[] = [
  { name: "Sprint", props: { title: "Sprint 14", columns: sprint } },
  // The same column titles as Sprint, so a page holds two columns of each name (axe landmark-unique).
  { name: "Next sprint, same columns", props: { title: "Sprint 15", columns: sprint } },
  { name: "Empty columns", props: { columns: [{ title: "Backlog", cards: [] }, { title: "Doing", tone: "info", cards: [] }] } },
  { name: "8 columns, 50 cards, long text", props: { title: long(160), columns: fiftyCards } },
];

const week = [
  { title: "Design review", start: "2026-11-09T15:00:00Z", end: "2026-11-09T16:00:00Z", tone: "info", note: "Calendar and Board specs." },
  { title: "Overlapping sync", start: "2026-11-09T15:30:00Z", end: "2026-11-09T16:30:00Z" },
  { title: "Team offsite", start: "2026-11-10", end: "2026-11-12", tone: "success" },
  { title: "Release", start: "2026-11-12T22:00:00Z", tone: "warning", note: "Late in UTC, so it lands on Nov 12 in New York." },
  { title: "Late deploy", start: "2026-11-13T03:30:00Z", end: "2026-11-13T05:00:00Z", tone: "danger", note: "Written in UTC on Nov 13; New York shows Nov 12." },
  { title: "Retro", start: "2026-11-13", allDay: true },
];

const crossMonth = [
  { title: "Migration window", start: "2026-10-28", end: "2026-11-03", tone: "warning" },
  { title: "Holiday freeze", start: "2026-11-25", end: "2026-12-02", tone: "danger" },
  { title: "Overnight backfill", start: "2026-11-30T22:00", end: "2026-12-01T04:00", note: "Floating time: shown as written." },
  { title: "Kickoff", start: "2026-11-02T09:00", end: "2026-11-02T10:00", tone: "info" },
  { title: "Standup", start: "2026-11-02T09:30", end: "2026-11-02T09:45" },
  { title: "Planning", start: "2026-11-02T09:15", end: "2026-11-02T11:00", tone: "success" },
  { title: "Quarter close", start: "2026-12-31", tone: "success" },
];

const busyDay = Array.from({ length: 15 }, (_, index) => ({
  title: index === 0 ? long(160) : `Interview ${String(index + 1)}`,
  start: `2026-11-12T${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
  end: `2026-11-12T${String(9 + Math.floor(index / 2)).padStart(2, "0")}:00`,
  tone: tones[index % tones.length],
  ...(index === 1 ? { note: long(300) } : {}),
}));

/** Normal and extreme Calendar fixtures: overlaps, all-day plus timed, spans across months, 15 events on one day, and none. */
export const calendarFixtures: ComponentFixture[] = [
  { name: "Agenda in New York time", props: { title: "Launch week", timeZone: "America/New_York", events: week } },
  { name: "Month, spanning months", props: { title: "November", view: "month", month: "2026-11", weekStart: "monday", events: crossMonth } },
  { name: "Month, 15 events on one day", props: { view: "month", events: [...busyDay, { title: "All-day hiring push", start: "2026-11-12", tone: "info" }, { title: "Quiet day", start: "2026-11-20" }] } },
  { name: "Agenda, 15 events on one day", props: { events: busyDay } },
  { name: "Empty agenda", props: { events: [] } },
  { name: "Empty month", props: { view: "month", month: "2026-02", events: [] } },
  { name: "Month with no events or month", props: { view: "month", events: [] } },
];
