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
