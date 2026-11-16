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
      {
        title: "A feature grid with one wide card",
        note: "The first card spans two of three columns. On a phone every card is a full row.",
        spec: single("Grid", { columns: 3, spans: [2, 1, 1, 1, 1] }, {
          lead: { type: "Card", props: { title: "Every shelf, counted nightly", description: "The headline feature takes the wide cell." } },
          scan: { type: "Card", props: { title: "Scan", description: "Point a phone at a shelf." } },
          sync: { type: "Card", props: { title: "Sync", description: "Counts reach the office at once." } },
          alert: { type: "Card", props: { title: "Alerts", description: "Hear about a gap before a customer does." } },
          report: { type: "Card", props: { title: "Reports", description: "A weekly summary for each store." } },
        }),
      },
      {
        title: "Two columns on a phone",
        note: "Small items stay two across on a narrow screen, so a band of stats is half as tall.",
        spec: single("Grid", { columns: 4, narrowColumns: 2 }, {
          teams: metric("Teams", 1280, { variant: "plain" }),
          artifacts: metric("Artifacts", 48200, { format: "compact", variant: "plain" }),
          agents: metric("Agents", 312, { variant: "plain" }),
          uptime: metric("Uptime", 99.98, { unit: "%", variant: "plain" }),
        }),
      },
    ],
    rules: [
      "`columns` applies on wide screens. Phones show one column, or two with `narrowColumns: 2`, which is never more than `columns`.",
      "`spans` has one entry per child, in order: how many columns that child takes, from 1 to `columns`. Leave it out and every child takes one.",
      "Where the grid shows fewer columns than a span (two on a tablet, one on a phone), the child takes every column there is, so a wide card is a full row on a phone.",
      "`spans` pairs with the children written in the spec, so a Grid with `repeat` takes none.",
    ],
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
    rules: ["Give exactly one child per entry in `tabs`: child N is the panel for tab N.", "`defaultIndex` picks the tab that opens first (0-based).", "Do not give Tabs `repeat`: the panels pair with the tabs by their place in the spec, so write each panel out. Tabs with `repeat` still draw, with a warning."],
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
    rules: ["Give exactly one child per entry in `items`: child N is the body of item N.", "Do not give an Accordion `repeat`: the bodies pair with the items by their place in the spec, so write each body out. An Accordion with `repeat` still draws, with a warning."],
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
      {
        title: "Between items in a row",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "md" }, children: ["docs", "first", "pricing", "second", "changelog"] },
          docs: text("Docs"),
          first: { type: "Separator", props: { orientation: "vertical" } },
          pricing: text("Pricing"),
          second: { type: "Separator", props: { orientation: "vertical" } },
          changelog: text("Changelog"),
        }),
      },
    ],
    rules: ["`orientation: \"vertical\"` is a line between two items in a horizontal Box, as tall as the row. It takes no `label`. In a column, or once a `stackBelow` row has stacked, it lies flat between the same items, as wide as the column."],
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
      { title: "A display heading", note: "`size` sets the look; `level` still sets the outline.", spec: single("Heading", { text: "Plans your whole team can read", level: 2, size: "display", align: "center" }) },
    ],
    rules: ["Use one level-1 heading at most.", "`size` changes how large a heading looks, never its level. The two largest sizes shrink on a narrow page column or canvas frame."],
  },
  Text: {
    examples: [
      {
        title: "Sizes and tones",
        spec: spec("page", {
          page: { type: "Stack", props: { gap: "sm" }, children: ["lead", "body", "fine", "accent"] },
          lead: text("The rollout is on track.", { size: "lg" }),
          body: text("Line breaks are kept,\nso short notes read as written."),
          fine: text("Updated by @release-bot 5 minutes ago.", { size: "sm", tone: "muted" }),
          accent: text("New this month", { tone: "accent", weight: "semibold" }),
        }),
      },
      {
        title: "Variants for a screen",
        spec: spec("page", {
          page: { type: "Stack", props: { gap: "sm" }, children: ["eyebrow", "price", "caption", "command"] },
          eyebrow: text("Team plan", { variant: "eyebrow" }),
          price: text("$29", { size: "4xl", weight: "semibold" }),
          caption: text("Per person each month, billed yearly.", { variant: "caption" }),
          command: text("pnpm add artifacts", { variant: "mono" }),
        }),
      },
    ],
    rules: ["A `variant` sets a size and a tone; `size` and `tone` still win when given.", "`tone`: default, muted, a status tone (info, success, warning, danger), or accent, the accent color for words that are not a status: the theme's own accent, or blue on the default palette, whose accent is its text color. Every tone reads on every Box surface and in every theme; on a primary surface, which is the accent, accent text takes that surface's text color.", "`clamp` cuts the text off after that many lines with an ellipsis. The full text stays in the page for screen readers.",
      "`announce` speaks the text to screen readers when it appears after a reader's action, such as a line a button press shows through `visible`, and again when its words change. Text that is there when the interface is first drawn is not spoken. Do not set it on text that follows typing: it would speak on every key, and validation warns about it (`announce_follows_typing`). Mark one element for each action: when two appear together, only the last is spoken.",
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
    rules: ["`announce` speaks the title and text to screen readers when the Callout appears after a reader's action. A Callout that is there from the start is not spoken. Mark one element for each action: when two appear together, only the last is spoken."],
  },
  Badge: {
    examples: [
      { title: "Tones", spec: single("Stack", { direction: "horizontal", gap: "sm" }, { neutral: badge("draft"), info: badge("beta", "info"), success: badge("shipped", "success"), warning: badge("at risk", "warning"), danger: badge("blocked", "danger"), accent: badge("featured", "accent") }) },
      {
        title: "Variants and an icon",
        spec: single("Stack", { direction: "horizontal", gap: "sm" }, {
          soft: { type: "Badge", props: { label: "soft", tone: "info" } },
          solid: { type: "Badge", props: { label: "solid", tone: "success", variant: "solid", icon: "check" } },
          outline: { type: "Badge", props: { label: "outline", tone: "warning", variant: "outline" } },
          rated: { type: "Badge", props: { label: "4.8", icon: "star" } },
        }),
      },
      {
        title: "A status dot",
        note: "A dot alone is an unread mark: screen readers hear its label.",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["online", "live", "inbox", "unread"] },
          online: { type: "Badge", props: { label: "Online", tone: "success", dot: "start" } },
          live: { type: "Badge", props: { label: "Live", tone: "danger", variant: "solid", dot: "start" } },
          inbox: text("Inbox", { size: "sm" }),
          unread: { type: "Badge", props: { label: "Unread messages", tone: "info", dot: "only" } },
        }),
      },
    ],
    rules: [
      "`tone`: neutral (default), info, success, warning, danger, or accent. The status tones mean a state; accent is the accent color (the theme's own accent, or blue on the default palette), for a label that is not a status (New, Featured). Every tone reads in every variant on every Box surface and in every theme.",
      "`dot: \"start\"` draws a small dot in the tone before the label. `dot: \"only\"` draws the dot alone and keeps the label for screen readers, so the label must say what the dot means (\"Unread messages\"). A dot alone takes no `icon` or `variant`: it has no pill for them to style.",
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
      {
        title: "Markers",
        note: "A check for what a plan includes, a cross for what it leaves out.",
        spec: single("Grid", { columns: 2 }, {
          included: { type: "List", props: { marker: "check", items: ["Unlimited projects", "Weekly reports", "Email support"] } },
          excluded: { type: "List", props: { marker: "cross", items: ["Single sign-on", "Audit log"] } },
        }),
      },
    ],
    rules: ["`marker` is dot, check, cross, or arrow. A numbered list (`ordered`) keeps its numbers and takes no other marker."],
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
      {
        title: "A mockup menu",
        note: "Without `href` a link is the same words in the same style, going nowhere.",
        spec: single("Stack", { direction: "horizontal", gap: "lg" }, {
          product: { type: "Link", props: { label: "Product", variant: "nav", active: true } },
          pricing: { type: "Link", props: { label: "Pricing", variant: "nav" } },
          privacy: { type: "Link", props: { label: "Privacy", variant: "muted" } },
        }),
      },
      {
        title: "With an icon",
        note: "A link that leaves the page already ends with an arrow, so its icon goes at the start.",
        spec: single("Stack", { direction: "horizontal", gap: "lg" }, {
          guide: { type: "Link", props: { label: "Read the guide", href: "https://example.com/guide", icon: "book" } },
          solutions: { type: "Link", props: { label: "Solutions", variant: "nav", icon: "chevron-down", iconPosition: "end" } },
          sales: { type: "Link", props: { label: "Call sales", variant: "muted", icon: "phone" } },
        }),
      },
    ],
    rules: ["Only absolute http, https, and mailto URLs pass validation. Links open in a new tab.", "Leave `href` out for a link that goes nowhere. Relative and `#` addresses are refused.", "`icon` names an icon (see Icon) drawn at the start, or at the end with `iconPosition: \"end\"`. An inline link with an `href` ends with its own arrow, so its icon must go at the start; nav and muted links, and a link without `href`, take either side."],
  },
  Quote: {
    examples: [{ title: "With a citation", spec: single("Quote", { text: "Make it work, make it right, make it fast.", cite: "Kent Beck" }) }],
  },
} satisfies Record<string, ComponentDoc>;
