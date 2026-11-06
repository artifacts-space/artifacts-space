import { uiCatalog } from "./catalog";
import { exampleUiSpec } from "./fixtures/example";
import { uiLimits } from "./limits";
import { UI_SPEC_VERSION } from "./version";

/** Pulls the generated component list out of the catalog prompt. */
function componentReference(): string {
  const prompt = uiCatalog.prompt();
  const start = prompt.indexOf("AVAILABLE COMPONENTS");
  const end = prompt.indexOf("AVAILABLE ACTIONS");
  if (start === -1 || end === -1) return prompt;
  return prompt.slice(start, end).trim();
}

const rules = [
  `Submit ONE JSON object as the artifact content (not JSONL, not Markdown, no code fences): { "version": ${UI_SPEC_VERSION}, "root": "<key>", "elements": { "<key>": { "type", "props", "children" } }, "state": { … } }.`,
  `Always set "version": ${UI_SPEC_VERSION}.`,
  "`elements` is a flat map. `children` lists child keys in order; leaves may omit it. Each element has exactly one parent, and the root has none.",
  "Only use components from the list. Props are strict: strings and arrays have maximum sizes, and unknown props are ignored. Omit optional props instead of sending null.",
  "No free-form CSS, colors, or class names. Layout comes from Stack, Grid, Section, and Card; colors come from `tone`.",
  "Dynamic props: { \"$state\": \"/path\" } reads state, { \"$bindState\": \"/path\" } binds an input, { \"$template\": \"Hi ${/name}\" } interpolates, and { \"$cond\": …, \"$then\": …, \"$else\": … } picks a value. `$computed` is not supported.",
  "`visible` and `on` sit on the element, not inside props. `visible` uses conditions such as { \"$state\": \"/open\" } or { \"$state\": \"/tab\", \"eq\": \"a\" }.",
  "Events: Button emits `press`; Checkbox, Select, Switch, and Slider emit `change`. Actions may only be setState, pushState, removeState, or validateForm. Nothing can fetch or send data.",
  "`repeat` renders an element's children once per item of a state array: { \"repeat\": { \"statePath\": \"/items\", \"key\": \"id\" } }. Inside, read fields with { \"$item\": \"name\" }. A repeat cannot sit inside another repeat.",
  "Tabs and Accordion: one child per entry in `tabs` / `items`, in the same order.",
  'Chart types: bar, line, and area take `labels` plus one value per label in each series. Several bar series draw grouped bars; add `"stacked": true` to stack bar or area series (negatives stack below zero). pie and donut take one series: `labels` name the slices and values must be zero or more; more than 8 slices fold into "Other". scatter takes `points` instead: { "type": "scatter", "xLabel": "Size", "yLabel": "Time", "series": [{ "name": "Runs", "points": [{ "x": 4, "y": 38, "label": "optional" }] }] }. Use 3 or fewer scatter series so colors stay easy to tell apart.',
  "Metric `sparkline`: a list of numbers, oldest first, drawn as a small trend line. KeyValue shows label/value pairs (specs, settings, summaries); give a value a `tone` to show it as a status badge. Steps is a numbered runbook: each item has a `title`, an optional Markdown `body`, and optional `code` with a copy button.",
  'Board is a read-only status board: { "type": "Board", "props": { "title": "Sprint 14", "columns": [{ "title": "In progress", "tone": "info", "cards": [{ "title": "Ship the API", "body": "Short note.", "badges": [{ "label": "api", "tone": "info" }], "owner": "Dana", "due": "2026-11-12" }] }, { "title": "Done", "tone": "success", "count": 42, "cards": [] }] } }. Nothing on it can be dragged or changed by readers; to move a card, save a new version.',
  'Calendar shows dated events: { "type": "Calendar", "props": { "view": "agenda", "timeZone": "America/New_York", "events": [{ "title": "Offsite", "start": "2026-11-10", "end": "2026-11-12" }, { "title": "Review", "start": "2026-11-09T15:00:00Z", "end": "2026-11-09T16:00:00Z", "tone": "info", "note": "Room 4" }] } }. A date (2026-11-10) is all-day and its `end` date is included. Set `timeZone` whenever times carry Z or an offset; without it every time shows exactly as written. Use "view": "month" for a month grid (narrow screens show it as a list) and "month": "2026-11" to pick the month it opens on.',
  "Links allow only absolute http, https, and mailto URLs. Markdown renders without raw HTML.",
  "Image and File show uploaded files only, by id: upload with files_request_upload, PUT the bytes, then files_finalize, and put the returned id in `file`. URLs are refused. Saving attaches the files to the artifact; each file belongs to one artifact.",
  `Limits: ${uiLimits.maxSpecBytes.toLocaleString("en-US")} bytes, ${uiLimits.maxElements} elements, nesting depth ${uiLimits.maxDepth}, ${uiLimits.maxRepeatItems} items per repeat. Use Table (up to 500 rows) or List for long data.`,
  "Unsupported: `watch`, named `slots`, and keys or paths that use __proto__, constructor, or prototype.",
  "Call artifacts_validate before saving to see every problem at once. Each issue names the element key and says how to fix it.",
];

/**
 * The guide agents read before writing a ui artifact: our rules, the
 * component reference generated from the catalog, and one compact example.
 */
export function buildUiGuide(): string {
  return [
    `# ui artifacts (component set version ${UI_SPEC_VERSION})`,
    "A ui artifact is a json-render spec rendered with the artifacts.space component set. Pages are read-only to the world: inputs only change on-page state.",
    "## Rules",
    rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n"),
    "## Components",
    componentReference(),
    "## Example",
    JSON.stringify(exampleUiSpec, null, 2),
  ].join("\n\n");
}
