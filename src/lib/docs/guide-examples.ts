import { spec, type DocExample } from "./spec-builders";

/**
 * Example specs for the JSON Render guide pages. Each one is complete and
 * valid; tests check that every example validates with no issues.
 */

export const minimalExample: DocExample = {
  title: "Hello, artifacts",
  spec: spec("page", {
    page: { type: "Stack", props: { gap: "md" }, children: ["title", "body"] },
    title: { type: "Heading", props: { text: "Hello, artifacts", level: 1 } },
    body: { type: "Text", props: { text: "This page is one JSON object: a root key and a flat map of elements." } },
  }),
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const dashboardExample: DocExample = {
  title: "Weekly delivery dashboard",
  note: "Switch tabs and flip the toggle: inputs change on-page state only.",
  spec: spec(
    "page",
    {
      page: { type: "Section", props: { title: "Delivery, week 45", description: "Deploys, failures, and lead time across all services." }, children: ["kpis", "tabs", "risk-toggle", "risks"] },
      kpis: { type: "Grid", props: { columns: 3 }, children: ["kpi-deploys", "kpi-failure", "kpi-lead"] },
      "kpi-deploys": { type: "Metric", props: { label: "Deploys", value: 128, change: 14, changeFormat: "percent", goodDirection: "up", sparkline: [12, 18, 21, 17, 24, 19, 17] } },
      "kpi-failure": { type: "Metric", props: { label: "Change failure rate", value: 3.1, format: "percent", change: -0.8, goodDirection: "down" } },
      "kpi-lead": { type: "Metric", props: { label: "Lead time", value: 5.2, unit: "h", change: -1.1, goodDirection: "down" } },
      tabs: { type: "Tabs", props: { tabs: [{ label: "Trend" }, { label: "Failures" }] }, children: ["trend", "failures"] },
      trend: {
        type: "Chart",
        props: { type: "bar", stacked: true, title: "Deploys per day", labels: days, series: [{ name: "Succeeded", values: [12, 17, 20, 16, 23, 18, 16] }, { name: "Failed", values: [0, 1, 1, 1, 1, 1, 1] }] },
      },
      failures: {
        type: "Table",
        props: {
          columns: [{ key: "service", label: "Service" }, { key: "when", label: "When" }, { key: "cause", label: "Cause" }, { key: "minutes", label: "Minutes down", align: "right", format: "number" }],
          rows: [
            { service: "api", when: "Tue 14:02", cause: "Migration lock timeout", minutes: 6 },
            { service: "web", when: "Thu 09:40", cause: "Missing env var", minutes: 2 },
            { service: "worker", when: "Sat 22:15", cause: "Queue backlog", minutes: 11 },
          ],
        },
      },
      "risk-toggle": { type: "Switch", props: { label: "Show open risks", checked: { $bindState: "/showRisks" } } },
      risks: { type: "Callout", props: { tone: "warning", title: "Open risks", text: "The worker queue backs up on Saturdays. Add a second consumer before the holiday traffic." }, visible: { $state: "/showRisks" } },
    },
    { showRisks: false },
  ),
};

export const stateExample: DocExample = {
  title: "Read state with $state",
  spec: spec(
    "card",
    {
      card: { type: "Card", props: { title: "Build" }, children: ["status", "progress"] },
      status: { type: "Badge", props: { label: { $state: "/build/status" }, tone: "success" } },
      progress: { type: "Progress", props: { label: "Tests", value: { $state: "/build/passed" }, max: { $state: "/build/total" }, format: "fraction" } },
    },
    { build: { status: "passing", passed: 412, total: 418 } },
  ),
};

export const bindStateExample: DocExample = {
  title: "An input bound to state",
  note: "Move the slider: it writes /percent, and the bar and the text read it.",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "md" }, children: ["slider", "bar", "line"] },
      slider: { type: "Slider", props: { label: "Rollout", min: 0, max: 100, step: 10, value: { $bindState: "/percent" } } },
      bar: { type: "Progress", props: { label: "Users on the new version", value: { $state: "/percent" } } },
      line: { type: "Text", props: { size: "sm", tone: "muted", text: { $template: "${/percent}% of users get the new checkout." } } },
    },
    { percent: 30 },
  ),
};

export const templateExample: DocExample = {
  title: "Interpolate state into text",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "sm" }, children: ["team", "line"] },
      team: { type: "Select", props: { label: "Team", options: ["Platform", "Web", "Data"], value: { $bindState: "/team" } } },
      line: { type: "Text", props: { text: { $template: "${/team} owns ${/count} open incidents." } } },
    },
    { team: "Platform", count: 3 },
  ),
};

export const condExample: DocExample = {
  title: "Pick a tone and a label from state",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "sm" }, children: ["env", "badge"] },
      env: { type: "Select", props: { label: "Environment", options: ["Production", "Preview", "Development"], value: { $bindState: "/env" } } },
      badge: {
        type: "Badge",
        props: {
          label: { $cond: { $state: "/env", eq: "Production" }, $then: "Live traffic", $else: "Safe to test" },
          tone: { $cond: { $state: "/env", eq: "Production" }, $then: "danger", $else: "success" },
        },
      },
    },
    { env: "Preview" },
  ),
};

export const visibleExample: DocExample = {
  title: "Show an element only when a condition holds",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "sm" }, children: ["count", "ok", "warn"] },
      count: { type: "Slider", props: { label: "Open bugs", min: 0, max: 20, value: { $bindState: "/bugs" } } },
      ok: { type: "Callout", props: { tone: "success", text: "Under the release bar. Ship it." }, visible: { $state: "/bugs", lte: 5 } },
      warn: { type: "Callout", props: { tone: "warning", text: "Over the release bar of 5 open bugs." }, visible: { $state: "/bugs", gt: 5 } },
    },
    { bugs: 3 },
  ),
};

export const repeatExample: DocExample = {
  title: "One card per item, with add and remove",
  note: "Add services, then remove one: pushState and removeState change the /services array.",
  spec: spec(
    "page",
    {
      page: { type: "Stack", props: { gap: "md" }, children: ["add", "list"] },
      add: { type: "Stack", props: { direction: "horizontal", gap: "sm" }, children: ["add-api", "add-web"] },
      "add-api": { type: "Button", props: { label: "Add api", variant: "outline" }, on: { press: { action: "pushState", params: { statePath: "/services", value: { name: "api", owner: "Ada" } } } } },
      "add-web": { type: "Button", props: { label: "Add web", variant: "outline" }, on: { press: { action: "pushState", params: { statePath: "/services", value: { name: "web", owner: "Sam" } } } } },
      list: { type: "Stack", props: { gap: "sm" }, repeat: { statePath: "/services" }, children: ["item"] },
      item: { type: "Card", props: { title: { $item: "name" }, description: { $template: "Owner: ${owner}" } }, children: ["remove"] },
      remove: { type: "Button", props: { label: "Remove", variant: "ghost" }, on: { press: { action: "removeState", params: { statePath: "/services", index: { $index: true } } } } },
    },
    { services: [{ name: "worker", owner: "Lee" }] },
  ),
};

export const setStateExample: DocExample = {
  title: "Buttons that set state",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "sm" }, children: ["choices", "answer"] },
      choices: { type: "Stack", props: { direction: "horizontal", gap: "sm" }, children: ["approve", "hold"] },
      approve: { type: "Button", props: { label: "Approve" }, on: { press: { action: "setState", params: { statePath: "/decision", value: "Approved" } } } },
      hold: { type: "Button", props: { label: "Hold", variant: "outline" }, on: { press: { action: "setState", params: { statePath: "/decision", value: "On hold" } } } },
      answer: { type: "Text", props: { text: { $template: "Decision: ${/decision}" } } },
    },
    { decision: "none yet" },
  ),
};

export const validateFormExample: DocExample = {
  title: "Mark a form as checked",
  note: "Press Check: validateForm writes { valid, errors } to /review. The stout inputs declare no field checks, so valid is true.",
  spec: spec(
    "stack",
    {
      stack: { type: "Stack", props: { gap: "sm" }, children: ["agree", "check", "result"] },
      agree: { type: "Checkbox", props: { label: "I read the runbook", checked: { $bindState: "/agreed" } } },
      check: { type: "Button", props: { label: "Check" }, on: { press: [{ action: "validateForm", params: { statePath: "/review" } }, { action: "setState", params: { statePath: "/checked", value: true } }] } },
      result: { type: "Callout", props: { tone: "success", text: { $template: "Checked. Valid: ${/review/valid}." } }, visible: { $state: "/checked" } },
    },
    { agreed: false, checked: false },
  ),
};

/** Every example on the guide pages, for the validation test. */
export const guideExamples: DocExample[] = [minimalExample, dashboardExample, stateExample, bindStateExample, templateExample, condExample, visibleExample, repeatExample, setStateExample, validateFormExample];
