import type { z } from "zod";

import {
  componentChecks,
  componentEvents,
  componentProps,
  containerComponents,
  isUiComponentName,
  plannedComponents,
  uiComponentNames,
  type UiComponentName,
} from "./catalog";
import { containsExpression, unsupportedExpressions } from "./expressions";
import { propIssues, specError, specWarning, type UiSpecIssue } from "./issues";
import { isPlainObject } from "./json-walk";
import { uiLimits } from "./limits";
import { pairedChildren } from "./props/layout";
import type { UiElement } from "./spec";

/** Actions an `on` binding may run. All of them only change the spec's own state. */
export const allowedActions = new Set(["setState", "pushState", "removeState", "validateForm"]);

const unsupportedFields = {
  watch: "Remove `watch`: state watchers are not supported. Use `on` bindings on Button or inputs instead.",
  slots: "Remove `slots`: named slots are not supported. Put child keys in `children`.",
} as const;

function typeIssue(key: string, type: string): UiSpecIssue {
  if ((plannedComponents as readonly string[]).includes(type)) {
    return specError("planned_component", `Element "${key}": ${type} is not available yet. Images and files arrive with file storage. Remove this element for now.`, key);
  }
  return specError("unknown_component", `Element "${key}": unknown component "${type}". Use one of: ${uiComponentNames.join(", ")}.`, key);
}

/** Validates props with the component's schema, skipping props that hold expressions (they resolve at render time). */
function checkProps(key: string, type: UiComponentName, props: Record<string, unknown>): UiSpecIssue[] {
  const unsupported = unsupportedExpressions(props);
  if (unsupported.length > 0) {
    return [specError("unsupported_expression", `Element "${key}" (${type}): ${unsupported.join(", ")} is not supported. Put the value in props directly or read it with { "$state": "/path" }.`, key)];
  }
  const dynamicKeys = new Set(Object.keys(props).filter((prop) => containsExpression(props[prop])));
  const schema: z.ZodType = componentProps[type];
  const result = schema.safeParse(props);
  const issues = result.success ? [] : result.error.issues.filter((issue) => !dynamicKeys.has(String(issue.path[0])));
  const errors = propIssues(key, type, issues);
  const check = componentChecks[type];
  if (errors.length === 0 && check) {
    errors.push(...check(props).map((problem) => specError("invalid_props", `Element "${key}" (${type}): ${problem}`, key)));
  }
  return [...errors, ...unknownPropWarnings(key, type, props)];
}

function unknownPropWarnings(key: string, type: UiComponentName, props: Record<string, unknown>): UiSpecIssue[] {
  const known = Object.keys(componentProps[type].shape);
  return Object.keys(props)
    .filter((prop) => !known.includes(prop))
    .map((prop) => specWarning("unknown_prop", `Element "${key}" (${type}): prop "${prop}" is not a ${type} prop and is ignored. Known props: ${known.join(", ") || "none"}.`, key));
}

function checkChildren(key: string, type: UiComponentName, element: UiElement): UiSpecIssue[] {
  if (!containerComponents.has(type)) {
    return element.children.length > 0
      ? [specWarning("leaf_children", `Element "${key}" (${type}) does not show children, so its ${element.children.length} children are hidden. Wrap them in a Stack or Card instead.`, key)]
      : [];
  }
  if (type !== "Tabs" && type !== "Accordion") return [];
  const prop = pairedChildren[type];
  const entries = element.props[prop];
  if (!Array.isArray(entries) || entries.length === element.children.length) return [];
  return [specError("children_mismatch", `Element "${key}" (${type}): ${entries.length} ${prop} but ${element.children.length} children. Give exactly one child per entry in ${prop}; child N is the panel for entry N.`, key)];
}

function bindingIssues(key: string, event: string, binding: unknown): UiSpecIssue[] {
  const bindings: unknown[] = Array.isArray(binding) ? binding : [binding];
  return bindings.flatMap((item) => {
    const action = isPlainObject(item) ? item.action : undefined;
    if (typeof action === "string" && allowedActions.has(action)) return [];
    return [specError("invalid_action", `Element "${key}": on.${event} must run one of ${[...allowedActions].join(", ")}, as { "action": "setState", "params": { "statePath": "/path", "value": … } }.`, key)];
  });
}

function checkEvents(key: string, type: UiComponentName, on: unknown): UiSpecIssue[] {
  if (on === undefined) return [];
  if (!isPlainObject(on)) return [specError("invalid_event", `Element "${key}": \`on\` must be an object that maps event names to actions.`, key)];
  const events = componentEvents[type] ?? [];
  return Object.entries(on).flatMap(([event, binding]) => {
    if (!events.includes(event)) {
      const supported = events.length > 0 ? `${type} supports: ${events.join(", ")}.` : `${type} has no events. Only Button (press) and inputs (change) do.`;
      return [specError("invalid_event", `Element "${key}": unknown event "${event}". ${supported}`, key)];
    }
    return bindingIssues(key, event, binding);
  });
}

/**
 * Validates one element: its key, component type, props (with expressions
 * skipped), children rules, and event bindings. `raw` is the element as the
 * agent wrote it, before normalization, so unsupported fields are caught.
 */
export function validateElement(key: string, element: UiElement, raw: Record<string, unknown>): UiSpecIssue[] {
  const issues: UiSpecIssue[] = [];
  if (key.length > uiLimits.maxKeyLength) {
    issues.push(specError("invalid_key", `Element key "${key.slice(0, 40)}…" is longer than ${uiLimits.maxKeyLength} characters. Use short keys such as "metric-revenue".`, key));
  }
  for (const [field, message] of Object.entries(unsupportedFields)) {
    if (raw[field] !== undefined) issues.push(specError("unsupported_field", `Element "${key}": ${message}`, key));
  }
  if (!isUiComponentName(element.type)) return [...issues, typeIssue(key, element.type)];
  return [
    ...issues,
    ...checkProps(key, element.type, element.props),
    ...checkChildren(key, element.type, element),
    ...checkEvents(key, element.type, element.on),
  ];
}
