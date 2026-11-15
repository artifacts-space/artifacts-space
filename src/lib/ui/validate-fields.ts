import { containsExpression, templateStatePaths } from "./expressions";
import { specError, specWarning, type UiSpecIssue } from "./issues";
import { isPlainObject } from "./json-walk";
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

/** How many bound text fields an error names before it counts the rest. The docs read it too. */
export const namedFieldLimit = 3;

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
 * unbinds them all, or the first `namedFieldLimit` and how many more. A
 * count is written only when it stands for two or more fields: one more
 * field is named, since "and 1 more" would hide the one name still needed.
 */
function namedFields(fields: readonly string[]): string {
  const shown = fields.length - namedFieldLimit === 1 ? fields.length : namedFieldLimit;
  const quoted = fields.slice(0, shown).map((key) => `"${key}"`);
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

/**
 * The props whose words an element speaks when it has `announce`, by
 * component. Add a component here when it takes `announce`;
 * validate-fields.test.ts fails for one that takes it and is missing.
 */
export const announcedProps: Readonly<Record<string, readonly string[]>> = {
  Text: ["text"],
  Callout: ["title", "text"],
};

/** Each state path a text field writes what is typed to, with the key of the first field bound to it. */
function typedPaths(spec: UiSpec): Map<string, string> {
  const paths = new Map<string, string>();
  for (const key of boundTextFields(spec)) {
    const value = spec.elements[key]?.props.value;
    const path = isPlainObject(value) && typeof value.$bindState === "string" ? value.$bindState : null;
    if (path !== null && !paths.has(path)) paths.set(path, key);
  }
  return paths;
}

/**
 * The state paths the words of a prop come from: `$state`, and each
 * `${/path}` of a `$template`. The test of a `$cond` only picks between
 * words, so it is not one of them; what it picks from is.
 */
function wordPaths(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(wordPaths);
  if (!isPlainObject(value)) return [];
  if ("$cond" in value) return [...wordPaths(value.$then), ...wordPaths(value.$else)];
  if (typeof value.$state === "string") return [value.$state];
  if (typeof value.$template === "string") return templateStatePaths(value.$template);
  return Object.values(value).flatMap(wordPaths);
}

/**
 * Warnings for an element that has `announce: true` and shows words read
 * from state that a text field writes. Its words change with every key, so
 * a screen reader would speak on every key. The spec still draws.
 */
export function announcedTypingIssues(spec: UiSpec): UiSpecIssue[] {
  const typed = typedPaths(spec);
  if (typed.size === 0) return [];
  const issues: UiSpecIssue[] = [];
  for (const [key, element] of Object.entries(spec.elements)) {
    if (element.props.announce !== true) continue;
    for (const prop of announcedProps[element.type] ?? []) {
      const path = wordPaths(element.props[prop]).find((read) => typed.has(read));
      if (path === undefined) continue;
      issues.push(specWarning(
        "announce_follows_typing",
        `Element "${key}" (${element.type}): \`announce\` is set and \`${prop}\` reads "${path}", which text field "${typed.get(path) ?? ""}" writes as a reader types, so a screen reader would speak on every key. Remove \`announce\`, or show words there that do not come from a text field.`,
        key,
      ));
      break;
    }
  }
  return issues;
}
