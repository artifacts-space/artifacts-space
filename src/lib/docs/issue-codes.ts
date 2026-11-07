import { blockingCodes } from "@/lib/ui/issues";

/**
 * Every issue code the ui validator can report, for the Validation page.
 * Blocking codes come from src/lib/ui/issues.ts; the rest are listed here
 * with what they mean, and a test fails when the validator gains a code
 * this list does not name.
 */
export interface IssueCodeDoc {
  code: string;
  severity: "error" | "warning";
  blocking: boolean;
  meaning: string;
}

const elementCodes: Omit<IssueCodeDoc, "blocking">[] = [
  { code: "invalid_props", severity: "error", meaning: "A prop fails its schema or a cross-field rule." },
  { code: "unknown_component", severity: "error", meaning: "The type is not in the catalog. The element renders nothing." },
  { code: "invalid_element", severity: "error", meaning: "An entry in elements is not an object with a type." },
  { code: "missing_child", severity: "error", meaning: "children names a key that does not exist." },
  { code: "children_mismatch", severity: "error", meaning: "Tabs or Accordion has a different number of children and entries." },
  { code: "invalid_event", severity: "error", meaning: "on uses an event the component does not emit." },
  { code: "invalid_action", severity: "error", meaning: "on runs an action other than the four state actions." },
  { code: "unsupported_expression", severity: "error", meaning: "A prop uses $computed." },
  { code: "unsupported_field", severity: "error", meaning: "The element has watch or slots." },
  { code: "invalid_key", severity: "error", meaning: "An element key is too long." },
  { code: "invalid_state", severity: "error", meaning: "state is not an object." },
  { code: "structure", severity: "error", meaning: "json-render's own catalog check failed." },
  { code: "missing_version", severity: "warning", meaning: "The spec has no version field." },
  { code: "unknown_prop", severity: "warning", meaning: "A prop the component does not have. It is ignored." },
  { code: "leaf_children", severity: "warning", meaning: "A component that does not show children has some." },
  { code: "orphaned_element", severity: "warning", meaning: "An element the root never reaches. It is ignored." },
];

const blockingMeanings: Record<string, string> = {
  invalid_json: "The content is not JSON.",
  too_large: "The spec is over the byte limit.",
  not_object: "The JSON is not an object.",
  too_deep_json: "JSON nests too deep anywhere in the spec.",
  unsafe_path: "A key or state path uses __proto__, constructor, or prototype.",
  unsupported_version: "version is not a supported number.",
  missing_root: "root is missing.",
  root_not_found: "root names a key that does not exist.",
  too_many_elements: "More elements than the limit.",
  invalid_elements: "elements is not an object.",
  shared_child: "One element has two parents.",
  root_is_child: "The root is listed as a child.",
  too_deep: "Elements nest deeper than the limit.",
  nested_repeat: "A repeat sits inside another repeat.",
  too_many_rendered: "Repeats expand past the rendered-element limit.",
  repeat_too_long: "One repeat has more items than the limit.",
};

/** Blocking codes first, then element errors, then warnings. */
export const issueCodeDocs: IssueCodeDoc[] = [
  ...[...blockingCodes].map((code) => ({ code, severity: "error" as const, blocking: true, meaning: blockingMeanings[code] ?? "" })),
  ...elementCodes.map((item) => ({ ...item, blocking: false })),
];
