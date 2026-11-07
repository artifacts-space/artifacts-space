import { single, spec, text, type DocElement } from "../spec-builders";
import type { ComponentDoc } from "./types";

const badge = (label: string, tone?: string): DocElement => ({ type: "Badge", props: tone ? { label, tone } : { label } });
const metric = (label: string, value: number, extra: Record<string, unknown> = {}): DocElement => ({ type: "Metric", props: { label, value, ...extra } });

export const layoutDocs = {
  Section: {
    examples: [
      {
        title: "A titled region",
        spec: single("Section", { title: "Rollout plan", description: "What ships, in what order." }, {
          "phase-1": text("Phase one ships to staff on Monday."),
          "phase-2": text("Phase two opens to every team on Thursday."),
        }),
      },
    ],
  },
  Stack: {
    examples: [
      { title: "Horizontal, small gap", spec: single("Stack", { direction: "horizontal", gap: "sm" }, { api: badge("api"), web: badge("web", "info"), breaking: badge("breaking", "danger") }) },
      { title: "Vertical, large gap", spec: single("Stack", { gap: "lg" }, { first: text("Stacks lay children out top to bottom by default."), second: text("Use gap to set the space between them.", { tone: "muted" }) }) },
    ],
    rules: ["Horizontal stacks wrap on narrow screens."],
  },
  Grid: {
    examples: [
      {
        title: "Three columns of metrics",
        spec: single("Grid", { columns: 3 }, {
          deploys: metric("Deploys this week", 42, { change: 12, changeFormat: "percent", goodDirection: "up" }),
          failures: metric("Failed deploys", 2, { change: -1, goodDirection: "down" }),
          lead: metric("Lead time", 3.4, { unit: "h", change: -0.6, goodDirection: "down" }),
        }),
      },
    ],
    rules: ["`columns` applies on wide screens. Phones always show one column."],
  },
  Card: {
    examples: [
      { title: "A decision card", spec: single("Card", { title: "Decision", description: "Recorded Nov 5, 2026." }, { body: text("Use Base UI for primitives. Radix is not used anywhere in the app.") }) },
    ],
  },
  Tabs: {
    examples: [
      {
        title: "Two panels",
        spec: single("Tabs", { tabs: [{ label: "Summary" }, { label: "Details" }] }, {
          summary: text("The migration finished in 14 minutes with no errors."),
          details: { type: "KeyValue", props: { items: [{ label: "Rows moved", value: 1_284_000, format: "compact" }, { label: "Duration", value: "14 min" }] } },
        }),
      },
    ],
    rules: ["Give exactly one child per entry in `tabs`: child N is the panel for tab N.", "`defaultIndex` picks the tab that opens first (0-based)."],
  },
  Accordion: {
    examples: [
      {
        title: "Questions and answers",
        spec: single("Accordion", { items: [{ title: "Why Base UI?" }, { title: "Why Neon?" }], openFirst: true }, {
          "base-ui": text("Accessible primitives without Radix, with a small API."),
          neon: text("Serverless Postgres with branching and scale to zero."),
        }),
      },
    ],
    rules: ["Give exactly one child per entry in `items`: child N is the body of item N."],
  },
  Separator: {
    examples: [
      {
        title: "Plain and labelled",
        spec: spec("page", {
          page: { type: "Stack", props: {}, children: ["above", "rule", "below", "appendix"] },
          above: text("Findings end here."),
          rule: { type: "Separator", props: {} },
          below: text("Raw data follows."),
          appendix: { type: "Separator", props: { label: "Appendix" } },
        }),
      },
    ],
  },
} satisfies Record<string, ComponentDoc>;

export const contentDocs = {
  Heading: {
    examples: [
      {
        title: "Levels 1 to 4",
        spec: spec("page", {
          page: { type: "Stack", props: { gap: "sm" }, children: ["h1", "h2", "h3", "h4"] },
          h1: { type: "Heading", props: { text: "Release 2.4", level: 1 } },
          h2: { type: "Heading", props: { text: "What changed" } },
          h3: { type: "Heading", props: { text: "Breaking changes", level: 3 } },
          h4: { type: "Heading", props: { text: "Migration notes", level: 4 } },
        }),
      },
    ],
    rules: ["Use one level-1 heading at most."],
  },
  Text: {
    examples: [
      {
        title: "Sizes and tones",
        spec: spec("page", {
          page: { type: "Stack", props: { gap: "sm" }, children: ["lead", "body", "fine"] },
          lead: text("The rollout is on track.", { size: "lg" }),
          body: text("Line breaks are kept,\nso short notes read as written."),
          fine: text("Updated by @release-bot 5 minutes ago.", { size: "sm", tone: "muted" }),
        }),
      },
    ],
  },
  Markdown: {
    examples: [
      {
        title: "GitHub-flavored Markdown",
        spec: single("Markdown", { content: "## Notes\n\n- [x] Freeze main\n- [ ] Tag the release\n\n| Owner | Task |\n|---|---|\n| Ada | Tag |\n| Sam | Announce |\n\nSee [the runbook](https://example.com/runbook) and run `pnpm release`." }),
      },
    ],
    rules: ["Raw HTML is not rendered. Images show as their alt text. Links allow http, https, and mailto only."],
  },
  Code: {
    examples: [{ title: "With a title and language", spec: single("Code", { code: "export function add(a: number, b: number) {\n  return a + b;\n}", language: "ts", title: "math.ts" }) }],
  },
  Callout: {
    examples: [
      {
        title: "Every tone",
        spec: spec("page", {
          page: { type: "Stack", props: { gap: "sm" }, children: ["info", "success", "warning", "danger", "neutral"] },
          info: { type: "Callout", props: { tone: "info", title: "Heads up", text: "The API moves to v2 next week." } },
          success: { type: "Callout", props: { tone: "success", text: "All 1,284 checks passed." } },
          warning: { type: "Callout", props: { tone: "warning", title: "Deploy freeze", text: "Deploys pause during the migration window." } },
          danger: { type: "Callout", props: { tone: "danger", text: "This drops the legacy table. Back it up first." } },
          neutral: { type: "Callout", props: { text: "Neutral is the default tone." } },
        }),
      },
    ],
  },
  Badge: {
    examples: [
      { title: "Tones", spec: single("Stack", { direction: "horizontal", gap: "sm" }, { neutral: badge("draft"), info: badge("beta", "info"), success: badge("shipped", "success"), warning: badge("at risk", "warning"), danger: badge("blocked", "danger") }) },
    ],
  },
  List: {
    examples: [
      {
        title: "Bulleted and numbered",
        spec: single("Grid", { columns: 2 }, {
          bullets: { type: "List", props: { items: ["Ship the API", "Write the docs", "Tell the team"] } },
          numbers: { type: "List", props: { items: ["Freeze main", "Tag the release", "Deploy"], ordered: true } },
        }),
      },
    ],
  },
  Steps: {
    examples: [
      {
        title: "A runbook",
        spec: single("Steps", {
          title: "Set up a local copy",
          items: [
            { title: "Install dependencies", body: "Use **pnpm**. The lockfile is checked in.", code: "pnpm install --frozen-lockfile", language: "sh" },
            { title: "Set the environment", body: "Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`." },
            { title: "Run the migrations", code: "pnpm db:migrate", language: "sh" },
            { title: "Start the app", code: "pnpm dev", language: "sh" },
          ],
        }),
      },
    ],
    rules: ["`body` is Markdown. `code` gets a copy button."],
  },
  Link: {
    examples: [
      {
        title: "Web and mail links",
        spec: single("Stack", { gap: "sm" }, {
          docs: { type: "Link", props: { label: "Base UI documentation", href: "https://base-ui.com" } },
          mail: { type: "Link", props: { label: "Email the team", href: "mailto:team@example.com" } },
        }),
      },
    ],
    rules: ["Only absolute http, https, and mailto URLs pass validation. Links open in a new tab."],
  },
  Quote: {
    examples: [{ title: "With a citation", spec: single("Quote", { text: "Make it work, make it right, make it fast.", cite: "Kent Beck" }) }],
  },
} satisfies Record<string, ComponentDoc>;
