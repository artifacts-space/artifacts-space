import { containsExpression } from "./expressions";
import { specError, type UiSpecIssue } from "./issues";
import type { UiSpec } from "./spec";

/**
 * Text a reader types must never leave the page. The catalog has no action
 * that sends data, so the only way out would be a link the reader follows:
 * an address, or Markdown with a link in it, built from state that a text
 * field writes. State can also be copied between paths by a button's
 * action, so paths are not tracked. The rule is about the whole spec: once
 * any text field writes to state, every prop that can become a link must
 * be written out in the spec, with no expression in it.
 */

/**
 * Components a reader types free text into; `value` is the prop that binds
 * what is typed to state. Add a component here when it starts to draw a
 * field a reader types in; field-views.test.tsx draws every catalog
 * component and fails for one that draws such a field and is missing.
 */
export const textFields: ReadonlySet<string> = new Set(["Input", "Textarea"]);

/** How many bound text fields an error names before it counts the rest. */
const namedFieldLimit = 3;

/**
 * Every prop that can become a link a reader follows, by component. Add a
 * prop here when a component starts to render one (an address, Markdown, a
 * diagram with links); validate-fields.test.ts fails for a component that
 * renders Markdown or a link and is missing.
 */
export const linkCarryingProps: Readonly<Record<string, readonly string[]>> = {
  Link: ["href"],
  Markdown: ["content"],
  Steps: ["items"],
  Diagram: ["code"],
};

/** The keys of every text field whose value is bound to state, in the spec's order. */
function boundTextFields(spec: UiSpec): string[] {
  return Object.entries(spec.elements)
    .filter(([, element]) => textFields.has(element.type) && containsExpression(element.props.value))
    .map(([key]) => key);
}

/** "a", "b", and "c": a list in words, as an error writes it. */
function inWords(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1) ?? ""}`;
}

/**
 * The bound text fields as an error names them: every key, so one pass
 * unbinds them all, or the first three and how many more when there are
 * more than that.
 */
function namedFields(fields: readonly string[]): string {
  const quoted = fields.slice(0, namedFieldLimit).map((key) => `"${key}"`);
  const more = fields.length - quoted.length;
  const names = inWords(more > 0 ? [...quoted, `${String(more)} more`] : quoted);
  return fields.length === 1 ? `text field ${names} is` : `text fields ${names} are`;
}

/**
 * Errors for props that could carry typed text into a link. They stop the
 * whole spec from rendering, so the rule holds on the page as well as on save.
 */
export function typedTextIssues(spec: UiSpec): UiSpecIssue[] {
  const fields = boundTextFields(spec);
  if (fields.length === 0) return [];
  const bound = namedFields(fields);
  const unbind = fields.length === 1 ? "remove the binding from the text field's `value`" : "remove the binding from each of those text fields' `value`";
  const issues: UiSpecIssue[] = [];
  for (const [key, element] of Object.entries(spec.elements)) {
    for (const prop of linkCarryingProps[element.type] ?? []) {
      if (!containsExpression(element.props[prop])) continue;
      issues.push(specError(
        "typed_text_in_link",
        `Element "${key}" (${element.type}): \`${prop}\` cannot use an expression in a spec whose ${bound} bound to state, because text a reader types must never reach a link. Write \`${prop}\` out in the spec, or ${unbind}.`,
        key,
      ));
    }
  }
  return issues;
}
