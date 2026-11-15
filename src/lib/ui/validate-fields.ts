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

/** Components a reader types free text into. */
const textFields: ReadonlySet<string> = new Set(["Input", "Textarea"]);

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

/** The key of a text field whose value is bound to state, or null when no field writes to state. */
function boundTextField(spec: UiSpec): string | null {
  for (const [key, element] of Object.entries(spec.elements)) {
    if (textFields.has(element.type) && containsExpression(element.props.value)) return key;
  }
  return null;
}

/**
 * Errors for props that could carry typed text into a link. They stop the
 * whole spec from rendering, so the rule holds on the page as well as on save.
 */
export function typedTextIssues(spec: UiSpec): UiSpecIssue[] {
  const field = boundTextField(spec);
  if (!field) return [];
  const issues: UiSpecIssue[] = [];
  for (const [key, element] of Object.entries(spec.elements)) {
    for (const prop of linkCarryingProps[element.type] ?? []) {
      if (!containsExpression(element.props[prop])) continue;
      issues.push(specError(
        "typed_text_in_link",
        `Element "${key}" (${element.type}): \`${prop}\` cannot use an expression in a spec whose text field "${field}" is bound to state, because text a reader types must never reach a link. Write \`${prop}\` out in the spec, or remove the binding from the text field's \`value\`.`,
        key,
      ));
    }
  }
  return issues;
}
