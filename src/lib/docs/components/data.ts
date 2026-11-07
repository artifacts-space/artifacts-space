import { maxBoardCards } from "@/lib/ui/props/planning";
import { maxPieSlices } from "@/lib/ui/chart-pie";

import { single } from "../spec-builders";
import type { ComponentDoc } from "./types";

const quarters = ["Q1", "Q2", "Q3", "Q4"];

export const dataDocs = {
  Table: {
    examples: [
      {
        title: "Formatted columns",
        spec: single("Table", {
          caption: "Cloud spend by team",
          currency: "USD",
          columns: [
            { key: "team", label: "Team" },
            { key: "spend", label: "Spend", align: "right", format: "currency" },
            { key: "change", label: "Change", align: "right", format: "percent" },
            { key: "owner", label: "Owner" },
          ],
          rows: [
            { team: "Platform", spend: 12_840, change: 4.2, owner: "Ada" },
            { team: "Web", spend: 5_300, change: -1.5, owner: "Sam" },
            { team: "Data", spend: 9_120, change: 0.8 },
          ],
        }),
      },
    ],
    rules: ["`rows` are objects keyed by each column's `key`. A missing cell shows a dash.", "Percent values are written as percents: 4.2 shows as 4.2%."],
  },
  Metric: {
    examples: [
      {
        title: "Currency, change, and a sparkline",
        spec: single("Grid", { columns: 2 }, {
          revenue: { type: "Metric", props: { label: "Revenue", value: 1_284_000, format: "currency", currency: "USD", change: 12.4, changeFormat: "percent", changeLabel: "vs last month", goodDirection: "up" } },
          active: { type: "Metric", props: { label: "Weekly active", value: 18_420, format: "compact", change: 6.1, changeFormat: "percent", goodDirection: "up", sparkline: [12_100, 12_900, 13_400, 13_100, 14_800, 15_900, 15_200, 16_700, 17_300, 18_420] } },
          errors: { type: "Metric", props: { label: "Errors", value: 42, change: 8, goodDirection: "down" } },
          status: { type: "Metric", props: { label: "Status", value: "Healthy" } },
        }),
      },
    ],
    rules: [
      "`change` uses `changeFormat`, which defaults to the value's `format`. A revenue metric usually sets changeFormat \"percent\".",
      "`goodDirection` decides the color: a change in the good direction shows as success, the other way as danger.",
      "`sparkline` takes 2 to 200 numbers, oldest first. null leaves a gap.",
    ],
  },
  Chart: {
    examples: [
      { title: "Line", spec: single("Chart", { type: "line", title: "Open bugs by week", labels: ["W1", "W2", "W3", "W4", "W5", "W6"], series: [{ name: "Open bugs", values: [21, 18, 15, 12, 10, 7] }] }) },
      {
        title: "Grouped bars with currency",
        spec: single("Chart", { type: "bar", title: "Spend by team", format: "currency", currency: "USD", labels: quarters, series: [{ name: "Platform", values: [42_000, 45_500, 39_000, 51_200] }, { name: "Web", values: [18_000, 21_000, 22_400, 25_100] }], xLabel: "Quarter", yLabel: "Spend" }),
      },
      { title: "Donut", spec: single("Chart", { type: "donut", title: "Traffic by source", labels: ["Search", "Direct", "Social", "Email"], series: [{ name: "Visits", values: [5_400, 3_100, 1_200, 640] }] }) },
    ],
    rules: [
      "bar, line, and area: each series has one value per label (null for a gap).",
      `pie and donut: exactly one series, values zero or more. More than ${String(maxPieSlices)} slices fold into "Other".`,
      "scatter: series carry `points` instead of `values`, and the chart has no labels.",
      "`stacked` works with bar and area only.",
      "See the Charts page for every type and the format rules.",
    ],
  },
  KeyValue: {
    examples: [
      {
        title: "A spec sheet",
        spec: single("KeyValue", {
          title: "Production database",
          currency: "USD",
          columns: 2,
          items: [
            { label: "Engine", value: "Postgres 17" },
            { label: "Region", value: "aws-us-east-2", mono: true },
            { label: "Status", value: "Healthy", tone: "success" },
            { label: "Storage", value: 18_432_000_000, format: "compact" },
            { label: "Monthly cost", value: 412.5, format: "currency" },
            { label: "Autoscaling", value: true },
          ],
        }),
      },
    ],
    rules: ["`format` styles a number like a Table column. `tone` shows the value as a status badge. `mono` uses monospace, for ids and paths."],
  },
  Progress: {
    examples: [
      {
        title: "Percent and fraction",
        spec: single("Stack", { gap: "md" }, {
          migration: { type: "Progress", props: { label: "Migration", value: 64 } },
          tasks: { type: "Progress", props: { label: "Launch tasks", value: 7, max: 12, format: "fraction" } },
        }),
      },
    ],
    rules: ["`max` defaults to 100 and must be greater than 0."],
  },
  Timeline: {
    examples: [
      {
        title: "Done, current, and upcoming",
        spec: single("Timeline", {
          items: [
            { title: "Design agreed", time: "Nov 5", status: "done" },
            { title: "Component set", time: "Nov 6", status: "current", description: "Stout components and the gallery." },
            { title: "File storage", time: "Nov 8", status: "upcoming" },
          ],
        }),
      },
    ],
  },
  Diagram: {
    examples: [
      { title: "A flowchart", spec: single("Diagram", { title: "Request flow", code: "flowchart LR\n  Agent -->|MCP| API --> DB[(Postgres)]\n  API --> Page[Artifact page]" }) },
      { title: "A sequence diagram", spec: single("Diagram", { code: "sequenceDiagram\n  Agent->>Server: artifacts_validate\n  Server-->>Agent: Valid ui content\n  Agent->>Server: artifacts_create\n  Server-->>Agent: id and url" }) },
    ],
    rules: ["Mermaid draws in the browser in strict mode and shows the result as an image, so nothing in the source can run."],
  },
} satisfies Record<string, ComponentDoc>;

export const planningDocs = {
  Board: {
    examples: [
      {
        title: "A sprint board",
        spec: single("Board", {
          title: "Sprint 14",
          columns: [
            { title: "To do", cards: [{ title: "Write the release notes", owner: "Dana", due: "2026-11-12" }, { title: "Plan the billing page", body: "Seats, invoices, and upgrades.", badges: [{ label: "design", tone: "info" }] }] },
            { title: "In progress", tone: "info", cards: [{ title: "Calendar component", owner: "claude-opus", due: "2026-11-06", badges: [{ label: "ui", tone: "info" }] }, { title: "Fix share dialog overflow", tone: "warning", badges: [{ label: "bug", tone: "danger" }], owner: "Sam" }] },
            { title: "Done", tone: "success", count: 42, cards: [{ title: "Pie and donut charts", tone: "success" }] },
          ],
        }),
      },
    ],
    rules: [
      `Up to ${String(maxBoardCards)} cards across all columns.`,
      "`count` replaces the shown card count, for a column that lists only some of its cards. It cannot be lower than the cards shown.",
      "`due` is an ISO date such as 2026-11-06. Readers cannot drag cards; save a new version to move one.",
    ],
  },
  Calendar: {
    examples: [
      {
        title: "Agenda in New York time",
        spec: single("Calendar", {
          title: "Launch week",
          timeZone: "America/New_York",
          events: [
            { title: "Design review", start: "2026-11-09T15:00:00Z", end: "2026-11-09T16:00:00Z", tone: "info", note: "Room 4" },
            { title: "Team offsite", start: "2026-11-10", end: "2026-11-11", tone: "success" },
            { title: "Release", start: "2026-11-12T22:00:00Z", tone: "warning" },
          ],
        }),
      },
      {
        title: "Month grid",
        spec: single("Calendar", {
          view: "month",
          month: "2026-11",
          weekStart: "monday",
          events: [
            { title: "Migration window", start: "2026-11-02", end: "2026-11-04", tone: "warning" },
            { title: "Kickoff", start: "2026-11-02T09:00", end: "2026-11-02T10:00", tone: "info" },
            { title: "Holiday freeze", start: "2026-11-25", end: "2026-11-30", tone: "danger" },
          ],
        }),
      },
    ],
    rules: [
      "A date (2026-11-10) is all-day, and an all-day `end` date is included.",
      "A time without Z or an offset (2026-11-10T09:00) shows exactly as written. Times with Z or an offset move into `timeZone`; the reader's own time zone is never used.",
      "`start` and `end` must both be dates or both be times, and `end` cannot come before `start`.",
      "Narrow screens show the month view as a list.",
    ],
  },
} satisfies Record<string, ComponentDoc>;
