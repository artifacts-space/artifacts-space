import type { UiComponentName } from "../catalog";
import { chartFixtures } from "./charts";
import { keyValueFixtures, stepsFixtures } from "./details";
import { boardFixtures, calendarFixtures } from "./planning";

/** A child element used inside a container fixture. */
export interface FixtureChild {
  type: string;
  props: Record<string, unknown>;
}

/** One way to render a component, from ordinary to extreme. */
export interface ComponentFixture {
  name: string;
  props: Record<string, unknown>;
  children?: FixtureChild[];
}

const sentence = "Agents save decisions, plans, and results here so the next session starts with context. ";
/** Text at a component's length limit, made of real words. */
export const longText = (length: number) => sentence.repeat(Math.ceil(length / sentence.length)).slice(0, length).trim();
/** One unbroken token, to test wrapping. */
export const unbroken = (length: number) => "x".repeat(length);

const text = (value: string): FixtureChild => ({ type: "Text", props: { text: value } });
const manyRows = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, name: `Row ${index + 1}`, amount: (index * 7919) % 100_000, ok: index % 3 === 0 }));

const layout: Pick<Record<UiComponentName, ComponentFixture[]>, "Section" | "Stack" | "Grid" | "Card" | "Tabs" | "Accordion" | "Separator"> = {
  Section: [
    { name: "Normal", props: { title: "Rollout plan", description: "What ships, in what order." }, children: [text("Phase one ships to staff first.")] },
    { name: "Empty", props: {} },
    { name: "Long title", props: { title: longText(160), description: longText(600) }, children: [text(unbroken(200))] },
  ],
  Stack: [
    { name: "Horizontal", props: { direction: "horizontal", gap: "sm" }, children: [{ type: "Badge", props: { label: "api" } }, { type: "Badge", props: { label: "web", tone: "info" } }, { type: "Badge", props: { label: "breaking", tone: "danger" } }] },
    { name: "Empty", props: { direction: "horizontal" } },
  ],
  Grid: [
    { name: "Four columns", props: { columns: 4 }, children: Array.from({ length: 6 }, (_, index) => ({ type: "Metric", props: { label: `Metric ${index + 1}`, value: index * 1234 } })) },
    { name: "Empty", props: { columns: 3 } },
  ],
  Card: [
    { name: "Normal", props: { title: "Decision", description: "Use Base UI for primitives." }, children: [text("Radix is not used anywhere.")] },
    { name: "No title", props: {}, children: [text("A card with only content.")] },
  ],
  Tabs: [
    { name: "Normal", props: { tabs: [{ label: "Summary" }, { label: "Details" }] }, children: [text("Summary panel."), text("Details panel.")] },
    { name: "Many long tabs", props: { tabs: Array.from({ length: 12 }, (_, index) => ({ label: `Tab ${index + 1} ${longText(40)}` })), defaultIndex: 11 }, children: Array.from({ length: 12 }, (_, index) => text(`Panel ${index + 1}`)) },
  ],
  Accordion: [
    { name: "Normal", props: { items: [{ title: "Why Base UI?" }, { title: "Why Neon?" }], openFirst: true }, children: [text("Accessible primitives without Radix."), text("Serverless Postgres with branching.")] },
    { name: "Long titles", props: { items: [{ title: longText(160) }] }, children: [text(longText(2000))] },
  ],
  Separator: [
    { name: "Plain", props: {} },
    { name: "Labelled", props: { label: "Appendix" } },
  ],
};

const content: Pick<Record<UiComponentName, ComponentFixture[]>, "Heading" | "Text" | "Markdown" | "Code" | "Callout" | "Badge" | "List" | "Steps" | "Link" | "Quote"> = {
  Heading: [
    { name: "Levels", props: { text: "Level one heading", level: 1 } },
    { name: "Level four", props: { text: "Level four heading", level: 4 } },
    { name: "Very long", props: { text: longText(200), level: 1 } },
    { name: "Unbroken", props: { text: unbroken(200), level: 2 } },
  ],
  Text: [
    { name: "Normal", props: { text: "Plain text keeps\nits line breaks." } },
    { name: "Muted small", props: { text: "Muted small text.", tone: "muted", size: "sm" } },
    { name: "Empty", props: { text: "" } },
    { name: "At limit", props: { text: longText(5000) } },
  ],
  Markdown: [
    { name: "GFM", props: { content: "## Notes\n\n- [x] Done\n- [ ] Open\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`code` and **bold** and [a link](https://example.com).\n\n<script>alert(1)</script> [bad](javascript:alert(1))" } },
    { name: "Empty", props: { content: "" } },
  ],
  Code: [
    { name: "TypeScript", props: { code: "export function add(a: number, b: number) {\n  return a + b;\n}", language: "ts", title: "math.ts" } },
    { name: "Long line", props: { code: `const value = "${unbroken(400)}";` } },
    { name: "Empty", props: { code: "" } },
  ],
  Callout: [
    { name: "Tones", props: { text: "Deploys pause during the migration window.", title: "Heads up", tone: "warning" } },
    { name: "Danger", props: { text: "This drops the legacy table.", tone: "danger" } },
    { name: "Success", props: { text: "All checks passed.", tone: "success" } },
    { name: "Long", props: { text: longText(2000), title: longText(160), tone: "info" } },
  ],
  Badge: [
    { name: "Tones", props: { label: "beta", tone: "info" } },
    { name: "Long", props: { label: longText(60), tone: "success" } },
  ],
  List: [
    { name: "Bullets", props: { items: ["Ship the API", "Write the docs", "Tell the team"] } },
    { name: "Ordered", props: { items: ["First", "Second"], ordered: true } },
    { name: "Empty", props: { items: [] } },
    { name: "Many", props: { items: Array.from({ length: 200 }, (_, index) => `Item ${index + 1}`), ordered: true } },
  ],
  Steps: stepsFixtures,
  Link: [
    { name: "Normal", props: { label: "Base UI docs", href: "https://base-ui.com" } },
    { name: "Mailto", props: { label: "Email the team", href: "mailto:team@example.com" } },
    { name: "Long", props: { label: longText(200), href: `https://example.com/${unbroken(300)}` } },
  ],
  Quote: [
    { name: "Normal", props: { text: "Make it work, make it right, make it fast.", cite: "Kent Beck" } },
    { name: "Long", props: { text: longText(2000) } },
  ],
};

const data: Pick<Record<UiComponentName, ComponentFixture[]>, "Table" | "Metric" | "Chart" | "KeyValue" | "Progress" | "Timeline" | "Board" | "Calendar" | "Diagram"> = {
  Table: [
    { name: "Normal", props: { caption: "Monthly spend", currency: "USD", columns: [{ key: "team", label: "Team" }, { key: "spend", label: "Spend", align: "right", format: "currency" }, { key: "change", label: "Change", align: "right", format: "percent" }], rows: [{ team: "Platform", spend: 12840, change: 4.2 }, { team: "Web", spend: 5300, change: -1.5 }, { team: "Data" }] } },
    { name: "Empty rows", props: { columns: [{ key: "a", label: "A" }], rows: [] } },
    { name: "500 rows", props: { columns: [{ key: "id", label: "#", format: "number" }, { key: "name", label: "Name" }, { key: "amount", label: "Amount", format: "compact", align: "right" }, { key: "ok", label: "OK" }], rows: manyRows } },
    { name: "Huge and long", props: { columns: [{ key: "v", label: "Value", format: "number", align: "right" }, { key: "t", label: longText(80) }], rows: [{ v: 1e300, t: unbroken(500) }, { v: -9_007_199_254_740_991, t: longText(2000) }, { v: null, t: null }] } },
  ],
  Metric: [
    { name: "Currency", props: { label: "Revenue", value: 1_284_000, format: "currency", currency: "USD", change: 12.4, changeFormat: "percent", changeLabel: "vs last month", goodDirection: "up" } },
    { name: "Bad change", props: { label: "Errors", value: 42, change: 8, goodDirection: "down" } },
    { name: "Text value", props: { label: "Status", value: "Healthy" } },
    { name: "Huge", props: { label: longText(80), value: 1e300, unit: "ops", change: -1e20, format: "compact" } },
    { name: "Sparkline", props: { label: "Weekly active", value: 18_420, format: "compact", change: 6.1, changeFormat: "percent", goodDirection: "up", sparkline: [12_100, 12_900, 13_400, 13_100, 14_800, 15_900, 15_200, 16_700, 17_300, 18_420] } },
    { name: "Sparkline, gaps and huge", props: { label: "Volatile", value: -3, sparkline: [1e300, null, -1e300, 0, null, 5, 5, -3] } },
    { name: "Sparkline, flat and one point", props: { label: "Flat", value: 5, sparkline: [5, 5, 5] } },
    { name: "Sparkline, 200 points", props: { label: "Requests", value: 200, sparkline: Array.from({ length: 200 }, (_, index) => Math.round(Math.sin(index / 9) * 50 + index)) } },
  ],
  Chart: chartFixtures,
  KeyValue: keyValueFixtures,
  Progress: [
    { name: "Normal", props: { label: "Migration", value: 64 } },
    { name: "Fraction", props: { label: "Tasks", value: 7, max: 12, format: "fraction" } },
    { name: "Over and under", props: { label: "Over max", value: 250 } },
    { name: "Negative", props: { label: "Below zero", value: -10 } },
  ],
  Timeline: [
    { name: "Normal", props: { items: [{ title: "Design agreed", time: "Nov 5", status: "done" }, { title: "Component set", time: "Nov 6", status: "current", description: "Stout components and gallery." }, { title: "File storage", status: "upcoming" }] } },
    { name: "Empty", props: { items: [] } },
    { name: "Long", props: { items: [{ title: longText(160), time: longText(60), description: longText(1000) }] } },
  ],
  Board: boardFixtures,
  Calendar: calendarFixtures,
  Diagram: [
    { name: "Flowchart", props: { title: "Request flow", code: "flowchart LR\n  Agent -->|MCP| API --> DB[(Neon)]\n  API --> Page" } },
    { name: "Sequence", props: { code: "sequenceDiagram\n  Agent->>Server: artifacts_create\n  Server-->>Agent: id" } },
    { name: "Broken source", props: { code: "flowchart TD\n  A -->" } },
    { name: "Script attempt", props: { code: "flowchart TD\n  A[\"<img src=x onerror=alert(1)>\"] --> B\n  click A call alert(1)" } },
  ],
};

const input: Pick<Record<UiComponentName, ComponentFixture[]>, "Checklist" | "Checkbox" | "Select" | "Switch" | "Slider" | "Button"> = {
  Checklist: [
    { name: "Normal", props: { title: "Launch", items: [{ label: "Write release notes", checked: true }, { label: "Tag the release" }] } },
    { name: "Empty", props: { items: [] } },
    { name: "Long", props: { items: [{ label: longText(300) }, { label: unbroken(300) }] } },
  ],
  Checkbox: [{ name: "Normal", props: { label: "Notify the team", description: "Sends nothing; state only." } }],
  Select: [
    { name: "Normal", props: { label: "Environment", options: ["Production", "Preview", "Development"], value: "Preview" } },
    { name: "Many long options", props: { label: longText(120), options: Array.from({ length: 100 }, (_, index) => `${index + 1}. ${longText(100)}`), placeholder: "Pick one" } },
  ],
  Switch: [{ name: "Normal", props: { label: "Dark launch", checked: true, description: "Hide the feature from users." } }],
  Slider: [
    { name: "Normal", props: { label: "Rollout percent", min: 0, max: 100, step: 5, value: 25 } },
    { name: "Huge range", props: { label: "Budget", min: -1e15, max: 1e15, value: 0 } },
  ],
  Button: [
    { name: "Variants", props: { label: "Primary" } },
    { name: "Outline", props: { label: "Outline", variant: "outline" } },
    { name: "Long", props: { label: longText(60), variant: "secondary" } },
  ],
};

/** Files the media fixtures point at. The gallery shows them from local stand-ins; nothing is uploaded. */
export const fixtureFiles = [
  { id: "00000000-0000-4000-8000-000000000001", filename: "architecture.png", contentType: "image/png", size: 48_213, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
  { id: "00000000-0000-4000-8000-000000000002", filename: "quarterly-report-final-v3.pdf", contentType: "application/pdf", size: 2_481_934, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
  { id: "00000000-0000-4000-8000-000000000003", filename: `${unbroken(110)}.docx`, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 26_214_400, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
] as const;

const [imageFile, pdfFile, longFile] = fixtureFiles;

const media: Pick<Record<UiComponentName, ComponentFixture[]>, "Image" | "File"> = {
  Image: [
    { name: "Normal", props: { file: imageFile.id, alt: "Architecture diagram", caption: "How agents reach the API." } },
    { name: "Long caption", props: { file: imageFile.id, alt: longText(300), caption: longText(300) } },
  ],
  File: [
    { name: "PDF", props: { file: pdfFile.id } },
    { name: "Label", props: { file: pdfFile.id, label: "Board deck" } },
    { name: "Long name", props: { file: longFile.id } },
    { name: "Unknown file", props: { file: "00000000-0000-4000-8000-0000000000ff" } },
  ],
};

/** Normal and extreme fixtures for every component, for the gallery and tests. */
export const componentFixtures: Record<UiComponentName, ComponentFixture[]> = { ...layout, ...content, ...data, ...input, ...media };

/** Builds a raw ui spec that renders one fixture: the component as root, its children below. */
export function fixtureSpec(type: string, fixture: ComponentFixture): Record<string, unknown> {
  const childKeys = (fixture.children ?? []).map((_, index) => `child-${index}`);
  const elements: Record<string, unknown> = { root: { type, props: fixture.props, children: childKeys } };
  (fixture.children ?? []).forEach((child, index) => {
    elements[`child-${index}`] = { type: child.type, props: child.props, children: [] };
  });
  return { version: 1, root: "root", elements };
}
