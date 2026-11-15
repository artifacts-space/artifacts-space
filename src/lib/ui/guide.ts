import { uiCatalog } from "./catalog";
import { exampleUiSpec } from "./fixtures/example";
import { uiLimits } from "./limits";
import { templateGuide } from "./templates/guide";
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
  "No free-form CSS, colors, or class names. Documents lay out with Stack, Grid, Section, and Card; colors come from `tone`. Text, Icon, and Badge also take `tone: \"accent\"`, the accent color (the theme's accent, or blue on the default palette), for words that stand out without being a status.",
  'To draw a screen (a website or app mockup), compose Box: { "type": "Box", "props": { "direction": "horizontal", "align": "center", "justify": "between", "padding": "md", "surface": "card", "border": "bottom" }, "children": [...] }. Every Box prop is a named step (`gap` and `padding`: none, xs, sm, md, lg, xl, 2xl, 3xl), never a CSS value. Pick a `surface` and the text inside takes a color that reads on it; `inverse` and `primary` switch everything inside to a contrasting palette. Use Icon, Placeholder (image, logo, video, map, and avatar stand-ins), Text `variant` and `size`, Heading `size`, Link without `href` (a menu item that goes nowhere), AvatarGroup (overlapping faces with a "+N" count), Kbd (a keyboard shortcut), Rating (stars to look at), and Badge `dot` (a status or unread mark) for the rest.',
  "Responsive layout follows the width of the surface the interface is drawn on (the page column, or a canvas frame), never the browser window: sm is 576, md is 672, lg is 896 pixels. A horizontal Box with `stackBelow` becomes a column below that width; on it, `alignBelow` sets the alignment once stacked (use `stretch` so stacked children fill the width when the row has `align: \"center\"`) and `reverseBelow` draws the stacked children last first (words above a picture; reading and keyboard order stay as written). `hideBelow` and `hideAbove` hide a Box. Grid drops to fewer columns on its own, down to one on a phone; `narrowColumns: 2` keeps two there, for small items such as metrics.",
  "Dynamic props: { \"$state\": \"/path\" } reads state, { \"$bindState\": \"/path\" } binds an input, { \"$template\": \"Hi ${/name}\" } interpolates, and { \"$cond\": …, \"$then\": …, \"$else\": … } picks a value. `$computed` is not supported.",
  "`visible` and `on` sit on the element, not inside props. `visible` uses conditions such as { \"$state\": \"/open\" } or { \"$state\": \"/tab\", \"eq\": \"a\" }.",
  'Fields for a mockup form: Input (`type`: text, email, search, number, or password) and Textarea, each with a required `label` and optional `description`, `error`, `hideLabel`, and `disabled`; Input also takes an `icon` drawn at its start (decoration: the label still names the field). Bind what a reader types with { "$bindState": "/path" } on `value`; it changes on-page state only and is never sent. A password Input is a drawn stand-in: it takes no `value`, cannot be bound, and cannot be typed into. In a spec with a bound Input or Textarea, Link `href`, Markdown `content`, Steps `items`, and Diagram `code` must be written in the spec, not read from state.',
  "Events: Button emits `press`; Checkbox, Select, Switch, Slider, Input, and Textarea emit `change`. Actions may only be setState, toggleState, pushState, removeState, or validateForm. toggleState flips a boolean, so one button opens and closes: { \"action\": \"toggleState\", \"params\": { \"statePath\": \"/open\" } }. Give that button `\"expanded\": { \"$state\": \"/open\" }` too, so screen readers hear whether what it opens is open. A toggle that stays on instead (Bold, a filter chip, a view switch) takes `\"pressed\": { \"$state\": \"/bold\" }` on the path it flips, which also draws it pressed, with `variant` outline, secondary, or ghost (it turns solid when pressed); never both, and never on a default or danger button. Nothing can fetch or send data.",
  "Text that appears after a reader's action (a thank-you line a button shows through `visible`) takes `announce: true` on the Text or Callout, so screen readers speak it. Leave it off text that is there from the start. Mark one element for each action: when two appear together, only the last is spoken.",
  "`repeat` renders an element's children once per item of a state array: { \"repeat\": { \"statePath\": \"/items\", \"key\": \"id\" } }. Inside, read fields with { \"$item\": \"name\" }. A repeat cannot sit inside another repeat.",
  "Tabs and Accordion: one child per entry in `tabs` / `items`, in the same order.",
  'Chart types: bar, line, and area take `labels` plus one value per label in each series. Several bar series draw grouped bars; add `"stacked": true` to stack bar or area series (negatives stack below zero). pie and donut take one series: `labels` name the slices and values must be zero or more; more than 8 slices fold into "Other". scatter takes `points` instead: { "type": "scatter", "xLabel": "Size", "yLabel": "Time", "series": [{ "name": "Runs", "points": [{ "x": 4, "y": 38, "label": "optional" }] }] }. Use 3 or fewer scatter series so colors stay easy to tell apart.',
  "Metric `sparkline`: a list of numbers, oldest first, drawn as a small trend line. KeyValue shows label/value pairs (specs, settings, summaries); give a value a `tone` to show it as a status badge. Steps is a numbered runbook: each item has a `title`, an optional Markdown `body`, and optional `code` with a copy button.",
  'Board is a read-only status board: { "type": "Board", "props": { "title": "Sprint 14", "columns": [{ "title": "In progress", "tone": "info", "cards": [{ "title": "Ship the API", "body": "Short note.", "badges": [{ "label": "api", "tone": "info" }], "owner": "Dana", "due": "2026-11-12" }] }, { "title": "Done", "tone": "success", "count": 42, "cards": [] }] } }. Nothing on it can be dragged or changed by readers; to move a card, save a new version.',
  'Calendar shows dated events: { "type": "Calendar", "props": { "view": "agenda", "timeZone": "America/New_York", "events": [{ "title": "Offsite", "start": "2026-11-10", "end": "2026-11-12" }, { "title": "Review", "start": "2026-11-09T15:00:00Z", "end": "2026-11-09T16:00:00Z", "tone": "info", "note": "Room 4" }] } }. A date (2026-11-10) is all-day and its `end` date is included. Set `timeZone` whenever times carry Z or an offset; without it every time shows exactly as written. Use "view": "month" for a month grid (narrow screens show it as a list) and "month": "2026-11" to pick the month it opens on.',
  "Links allow only absolute http, https, and mailto URLs. A Link takes an `icon` like a Button; an inline Link with an `href` ends with its own arrow, so its icon goes at the start. Markdown renders without raw HTML.",
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
    templateGuide("ui"),
    "## Components",
    componentReference(),
    "## Example",
    JSON.stringify(exampleUiSpec, null, 2),
  ].join("\n\n");
}
