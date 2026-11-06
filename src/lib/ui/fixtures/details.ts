import type { ComponentFixture } from "./components";

const long = (length: number) => "Settings, limits, and owners the next session needs to know. ".repeat(Math.ceil(length / 62)).slice(0, length).trim();

/** Normal and extreme KeyValue fixtures. */
export const keyValueFixtures: ComponentFixture[] = [
  {
    name: "Spec sheet",
    props: {
      title: "Production database",
      currency: "USD",
      items: [
        { label: "Engine", value: "Postgres 17" },
        { label: "Region", value: "aws-us-east-2", mono: true },
        { label: "Status", value: "Healthy", tone: "success" },
        { label: "Storage", value: 18_432_000_000, format: "compact" },
        { label: "Monthly cost", value: 412.5, format: "currency" },
        { label: "CPU", value: 63.2, format: "percent" },
        { label: "Autoscaling", value: true },
        { label: "Last backup", value: null },
      ],
    },
  },
  { name: "Two columns", props: { columns: 2, items: Array.from({ length: 12 }, (_, index) => ({ label: `Setting ${String(index + 1)}`, value: index % 4 === 0 ? "warn" : index * 1000, ...(index % 4 === 0 ? { tone: "warning" } : { format: "number" }) })) } },
  { name: "Empty", props: { items: [] } },
  {
    name: "Long and huge",
    props: {
      title: long(160),
      items: [
        { label: long(80), value: long(2000) },
        { label: "Unbroken", value: "x".repeat(400), mono: true },
        { label: "Huge", value: 1e300, format: "number" },
        { label: "Negative", value: -9_007_199_254_740_991, format: "currency" },
        { label: "Badge with long text", value: long(200), tone: "danger" },
        { label: "Number as text", value: 1234.5678, format: "text" },
      ],
    },
  },
  { name: "100 items", props: { items: Array.from({ length: 100 }, (_, index) => ({ label: `Key ${String(index + 1)}`, value: `value-${String(index + 1)}`, mono: true })) } },
];

const runbook = [
  { title: "Install dependencies", body: "Use **pnpm**. The lockfile is checked in, so installs are exact.", code: "pnpm install --frozen-lockfile", language: "sh" },
  { title: "Set the environment", body: "Copy the example file, then fill in the values:\n\n- `DATABASE_URL`\n- `BETTER_AUTH_SECRET`\n\nSee [the docs](https://example.com/docs) for details." },
  { title: "Run the migrations", code: "pnpm db:migrate\npnpm db:studio", language: "sh" },
  { title: "Start the app" },
];

/** Normal and extreme Steps fixtures. */
export const stepsFixtures: ComponentFixture[] = [
  { name: "Runbook", props: { title: "Set up a local copy", items: runbook } },
  { name: "Empty", props: { items: [] } },
  { name: "Long", props: { title: long(160), items: [{ title: long(160), body: long(5000), code: `curl https://example.com/${"x".repeat(600)}`, language: "a-language-label-at-forty-characters-lon" }, { title: "x".repeat(160) }] } },
  { name: "50 steps", props: { items: Array.from({ length: 50 }, (_, index) => ({ title: `Step ${String(index + 1)}: check the next thing` })) } },
];
