import { single, type DocExample } from "./spec-builders";

/** Chart examples for the Charts page. Tests check that each validates cleanly. */

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export const barExample: DocExample = {
  title: "Bar",
  spec: single("Chart", { type: "bar", title: "Deploys per month", labels: months, series: [{ name: "Deploys", values: [12, 19, 8, 22, 17, 25] }] }),
};

export const lineExample: DocExample = {
  title: "Line, two series",
  spec: single("Chart", { type: "line", title: "Signups and churn", labels: months, series: [{ name: "Signups", values: [120, 180, 240, 310, 290, 360] }, { name: "Churn", values: [20, 24, 22, 30, 28, 26] }] }),
};

export const areaExample: DocExample = {
  title: "Area",
  spec: single("Chart", { type: "area", title: "Storage used", format: "compact", height: "sm", labels: months, series: [{ name: "Bytes", values: [1_200_000_000, 1_450_000_000, 1_700_000_000, 2_100_000_000, 2_350_000_000, 2_900_000_000] }] }),
};

export const groupedExample: DocExample = {
  title: "Grouped bars",
  spec: single("Chart", {
    type: "bar",
    title: "Spend by team",
    format: "currency",
    currency: "USD",
    labels: ["Q1", "Q2", "Q3", "Q4"],
    series: [{ name: "Platform", values: [42_000, 45_500, 39_000, 51_200] }, { name: "Web", values: [18_000, 21_000, 22_400, 25_100] }, { name: "Data", values: [9_500, 12_000, 14_200, 15_800] }],
    xLabel: "Quarter",
    yLabel: "Spend",
  }),
};

export const stackedBarExample: DocExample = {
  title: "Stacked bars with negatives",
  spec: single("Chart", {
    type: "bar",
    stacked: true,
    title: "Net seats by source",
    labels: months,
    series: [{ name: "New", values: [30, 42, 18, 50, 24, 36] }, { name: "Expansion", values: [12, 8, 20, 8, 14, 10] }, { name: "Churn", values: [-15, -22, -8, -30, -12, -18] }],
  }),
};

export const stackedAreaExample: DocExample = {
  title: "Stacked area",
  spec: single("Chart", {
    type: "area",
    stacked: true,
    title: "Requests by region",
    format: "compact",
    labels: months,
    series: [{ name: "us-east", values: [820_000, 910_000, 960_000, 1_020_000, 1_100_000, 1_240_000] }, { name: "eu-west", values: [410_000, 450_000, 520_000, 540_000, 600_000, 640_000] }, { name: "ap-south", values: [90_000, 120_000, 160_000, 210_000, 260_000, 330_000] }],
  }),
};

export const gapsExample: DocExample = {
  title: "Gaps and negatives",
  note: "null leaves a gap; the line does not invent a value for March.",
  spec: single("Chart", { type: "line", title: "Margin", format: "percent", labels: months, series: [{ name: "Margin", values: [-12, -4, null, 6, 11, 18] }] }),
};

export const pieExample: DocExample = {
  title: "Pie",
  spec: single("Chart", { type: "pie", title: "Incidents by cause", labels: ["Config", "Deploy", "Capacity", "Dependency", "Other"], series: [{ name: "Incidents", values: [14, 9, 6, 4, 2] }] }),
};

export const donutExample: DocExample = {
  title: "Donut with currency",
  spec: single("Chart", { type: "donut", title: "Spend by vendor", format: "currency", currency: "EUR", labels: ["Neon", "Vercel", "Cloudflare"], series: [{ name: "Spend", values: [1_250, 980.5, 120] }] }),
};

export const scatterExample: DocExample = {
  title: "Scatter",
  spec: single("Chart", {
    type: "scatter",
    title: "Latency against payload size",
    xLabel: "Payload (KB)",
    yLabel: "p95 latency (ms)",
    series: [
      { name: "Edge", points: [{ x: 4, y: 38, label: "GET /a" }, { x: 12, y: 52 }, { x: 30, y: 61 }, { x: 64, y: 90, label: "POST /upload" }] },
      { name: "Origin", points: [{ x: 6, y: 120 }, { x: 18, y: 140 }, { x: 40, y: 182 }, { x: 80, y: 260, label: "POST /upload" }] },
    ],
  }),
};

export const formatsExample: DocExample = {
  title: "Formats side by side",
  spec: single("Grid", { columns: 2 }, {
    "as-percent": { type: "Chart", props: { type: "bar", title: "percent", format: "percent", height: "sm", labels: ["A", "B", "C"], series: [{ name: "Share", values: [12.5, 40, 47.5] }] } },
    "as-compact": { type: "Chart", props: { type: "bar", title: "compact", format: "compact", height: "sm", labels: ["A", "B", "C"], series: [{ name: "Views", values: [12_400, 1_250_000, 98_000_000] }] } },
    "as-currency": { type: "Chart", props: { type: "bar", title: "currency (JPY)", format: "currency", currency: "JPY", height: "sm", labels: ["A", "B", "C"], series: [{ name: "Cost", values: [1_200, 45_000, 980] }] } },
    "as-number": { type: "Chart", props: { type: "bar", title: "number", height: "sm", labels: ["A", "B", "C"], series: [{ name: "Count", values: [2.5, 14, 7.25] }] } },
  }),
};

/** Every chart example, for the validation test. */
export const chartExamples: DocExample[] = [barExample, lineExample, areaExample, groupedExample, stackedBarExample, stackedAreaExample, gapsExample, pieExample, donutExample, scatterExample, formatsExample];
