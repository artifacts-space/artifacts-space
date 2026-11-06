import type { ComponentFixture } from "./components";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longLabel = (index: number) => `Region ${String(index + 1)} with a very long name that hits the limit`.slice(0, 40);
const longName = "A series name long enough to reach the sixty character limit".slice(0, 60);

/** Deterministic pseudo-random numbers, so fixtures never change between renders. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const random = seeded(7);
const cloud = (count: number, offset: number) =>
  Array.from({ length: count }, () => ({ x: Math.round((random() * 100 + offset) * 10) / 10, y: Math.round((random() * 60 + offset / 2) * 10) / 10 }));

const cartesian: ComponentFixture[] = [
  { name: "Bar", props: { type: "bar", title: "Deploys per month", labels: months.slice(0, 6), series: [{ name: "Deploys", values: [12, 19, 8, 22, 17, 25] }] } },
  { name: "Line, two series", props: { type: "line", labels: months, series: [{ name: "Signups", values: [5, 9, 14, 20, null, 31, 35, 40, 38, 45, 52, 60] }, { name: "Churn", values: [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7] }] } },
  { name: "Area, negatives", props: { type: "area", labels: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Margin", values: [-20, -5, 10, 35] }], format: "percent" } },
  { name: "Empty", props: { type: "bar", labels: [], series: [{ name: "Nothing", values: [] }] } },
  { name: "All null", props: { type: "line", labels: ["a", "b"], series: [{ name: "Gaps", values: [null, null] }] } },
  { name: "Huge values, 200 points", props: { type: "bar", labels: Array.from({ length: 200 }, (_, index) => `P${String(index)}`), series: [{ name: "Huge", values: Array.from({ length: 200 }, (_, index) => (index % 2 ? 1e300 : -1e299)) }], format: "compact" } },
  { name: "Grouped bars, three series", props: { type: "bar", title: "Spend by team", format: "currency", currency: "USD", labels: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Platform", values: [42_000, 45_500, 39_000, 51_200] }, { name: "Web", values: [18_000, 0, 22_400, 25_100] }, { name: "Data", values: [9_500, 12_000, null, 15_800] }], yLabel: "Spend", xLabel: "Quarter" } },
  { name: "Stacked bars, negatives and gaps", props: { type: "bar", stacked: true, title: "Net change by source", labels: months.slice(0, 6), series: [{ name: "New", values: [30, 42, 18, 50, 0, 36] }, { name: "Expansion", values: [12, null, 20, 8, 14, 10] }, { name: "Churn", values: [-15, -22, -8, -30, -12, -40] }] } },
  { name: "Stacked bars, 8 series, 24 labels", props: { type: "bar", stacked: true, labels: Array.from({ length: 24 }, (_, index) => `Week ${String(index + 1)}`), series: Array.from({ length: 8 }, (_, seriesIndex) => ({ name: `Service ${String(seriesIndex + 1)}`, values: Array.from({ length: 24 }, (_, index) => ((index * 7 + seriesIndex * 13) % 17) + 2) })) } },
  { name: "Stacked area", props: { type: "area", stacked: true, title: "Storage by kind", format: "compact", labels: months, series: [{ name: "Images", values: months.map((_, index) => 1_200_000 + index * 180_000) }, { name: "Documents", values: months.map((_, index) => 800_000 + index * 60_000) }, { name: "Other", values: months.map((_, index) => (index % 3 === 0 ? null : 300_000)) }] } },
  { name: "Long labels and names", props: { type: "bar", title: "x".repeat(160), labels: Array.from({ length: 6 }, (_, index) => longLabel(index)), series: [{ name: longName, values: [1, 2, 3, 4, 5, 6] }, { name: `${longName.slice(0, 50)} two`, values: [6, 5, 4, 3, 2, 1] }], xLabel: "An x-axis name that is sixty characters long, right at limit", yLabel: "A y-axis name that is sixty characters long, right at limit" } },
];

const pies: ComponentFixture[] = [
  { name: "Pie", props: { type: "pie", title: "Traffic by source", labels: ["Search", "Direct", "Social", "Email"], series: [{ name: "Visits", values: [5_400, 3_100, 1_200, 640] }] } },
  { name: "Donut, currency", props: { type: "donut", title: "Spend by vendor", format: "currency", currency: "EUR", labels: ["Neon", "Vercel", "Cloudflare"], series: [{ name: "Spend", values: [1_250, 980.5, 120] }] } },
  { name: "Pie, 20 long slices fold into Other", props: { type: "pie", labels: Array.from({ length: 20 }, (_, index) => longLabel(index)), series: [{ name: "Share", values: Array.from({ length: 20 }, (_, index) => 20 - index) }] } },
  { name: "Donut, zeros and nulls", props: { type: "donut", labels: ["Done", "Skipped", "Missing", "Open"], series: [{ name: "Tasks", values: [12, 0, null, 4] }] } },
  { name: "Donut, one slice", props: { type: "donut", labels: ["Everything"], series: [{ name: "All", values: [42] }] } },
  { name: "Pie, all zero", props: { type: "pie", labels: ["a", "b"], series: [{ name: "Zero", values: [0, 0] }] } },
  { name: "Donut, huge values", props: { type: "donut", format: "compact", labels: ["Huge", "Also huge", "Small"], series: [{ name: "Big", values: [1e300, 5e299, 1] }] } },
];

const scatters: ComponentFixture[] = [
  { name: "Scatter, two series", props: { type: "scatter", title: "Latency vs payload", xLabel: "Payload (KB)", yLabel: "p95 latency (ms)", series: [{ name: "Edge", points: [{ x: 4, y: 38, label: "GET /a" }, { x: 12, y: 52 }, { x: 30, y: 61 }, { x: 64, y: 90, label: "POST /upload" }] }, { name: "Origin", points: [{ x: 6, y: 120 }, { x: 18, y: 140 }, { x: 40, y: 182 }, { x: 80, y: 260, label: "POST /upload" }] }] } },
  { name: "Scatter, 3 × 500 points", props: { type: "scatter", series: [{ name: "A", points: cloud(500, 0) }, { name: "B", points: cloud(500, 40) }, { name: "C", points: cloud(500, 80) }] } },
  { name: "Scatter, negatives and huge", props: { type: "scatter", format: "compact", xFormat: "currency", series: [{ name: "Mixed", points: [{ x: -1e12, y: -5e14 }, { x: 0, y: 0 }, { x: 2.5e12, y: 9e14 }, { x: 1e12, y: -2e14 }] }] } },
  { name: "Scatter, one point", props: { type: "scatter", series: [{ name: "Only", points: [{ x: 2020, y: 7 }] }] } },
  { name: "Scatter, empty", props: { type: "scatter", series: [{ name: "None", points: [] }] } },
];

/** Normal and extreme Chart fixtures for every chart type. */
export const chartFixtures: ComponentFixture[] = [...cartesian, ...pies, ...scatters];
