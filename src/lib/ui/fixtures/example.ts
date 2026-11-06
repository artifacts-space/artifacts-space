import { UI_SPEC_VERSION } from "../version";

/**
 * A compact, complete ui spec. The agent guide shows it as the reference
 * example, and tests check that it stays valid.
 */
export const exampleUiSpec = {
  version: UI_SPEC_VERSION,
  root: "page",
  state: { showDetails: false },
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["title", "kpis", "trend", "details-toggle", "details"] },
    title: { type: "Heading", props: { text: "Release 2.4 readiness", level: 1 } },
    kpis: { type: "Grid", props: { columns: 3 }, children: ["kpi-tests", "kpi-bugs", "kpi-perf"] },
    "kpi-tests": { type: "Metric", props: { label: "Tests passing", value: 98.6, format: "percent", change: 1.2, goodDirection: "up" } },
    "kpi-bugs": { type: "Metric", props: { label: "Open bugs", value: 7, change: -3, goodDirection: "down" } },
    "kpi-perf": { type: "Metric", props: { label: "p95 latency", value: 182, unit: "ms", change: -14, goodDirection: "down" } },
    trend: {
      type: "Chart",
      props: {
        type: "line",
        title: "Open bugs by week",
        labels: ["W1", "W2", "W3", "W4"],
        series: [{ name: "Open bugs", values: [21, 15, 10, 7] }],
      },
    },
    "details-toggle": { type: "Switch", props: { label: "Show remaining work", checked: { $bindState: "/showDetails" } } },
    details: {
      type: "Card",
      props: { title: "Remaining work" },
      visible: { $state: "/showDetails" },
      children: ["todo"],
    },
    todo: {
      type: "Checklist",
      props: { items: [{ label: "Fix flaky upload test", checked: true }, { label: "Update the migration guide" }] },
    },
  },
};
