import type { z } from "zod";

import { uiLimits } from "./limits";

/**
 * One problem found in a ui spec. `message` says what is wrong and how to fix
 * it, in words an agent can act on without reading our source.
 */
export interface UiSpecIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** The element key the issue belongs to, when it belongs to one. */
  elementKey?: string;
}

/** Issue codes that stop the whole spec from rendering. */
export const blockingCodes: ReadonlySet<string> = new Set([
  "invalid_json",
  "too_large",
  "not_object",
  "too_deep_json",
  "unsafe_path",
  "unsupported_version",
  "missing_root",
  "root_not_found",
  "too_many_elements",
  "invalid_elements",
  "shared_child",
  "root_is_child",
  "too_deep",
  "nested_repeat",
  "too_many_rendered",
  "repeat_too_long",
]);

/** Builds an error issue. */
export function specError(code: string, message: string, elementKey?: string): UiSpecIssue {
  return elementKey === undefined ? { severity: "error", code, message } : { severity: "error", code, message, elementKey };
}

/** Builds a warning issue. */
export function specWarning(code: string, message: string, elementKey?: string): UiSpecIssue {
  return elementKey === undefined ? { severity: "warning", code, message } : { severity: "warning", code, message, elementKey };
}

/** Formats a zod issue path such as ["series", 0, "values"] as `series[0].values`. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") return `${text}[${segment}]`;
    const name = String(segment);
    return text ? `${text}.${name}` : name;
  }, "");
}

/** Turns zod prop issues into element issues that name the prop and the problem. */
export function propIssues(elementKey: string, type: string, issues: readonly z.core.$ZodIssue[]): UiSpecIssue[] {
  return issues.map((issue) => {
    const where = formatPath(issue.path);
    const prop = where ? `props.${where}` : "props";
    return specError("invalid_props", `Element "${elementKey}" (${type}): ${prop}: ${issue.message}`, elementKey);
  });
}

/** True when any issue is an error. */
export function hasErrors(issues: readonly UiSpecIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** True when an issue stops the spec from rendering at all. */
export function isBlocking(issue: UiSpecIssue): boolean {
  return issue.severity === "error" && blockingCodes.has(issue.code);
}

/**
 * Formats issues as a short report for agents and people: errors first, at
 * most `uiLimits.maxReportedIssues` lines, then a count of the rest.
 */
export function formatUiSpecIssues(issues: readonly UiSpecIssue[]): string {
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const shown = sorted.slice(0, uiLimits.maxReportedIssues).map((issue) => `- ${issue.severity === "error" ? "Error" : "Warning"}: ${issue.message}`);
  const hidden = sorted.length - shown.length;
  if (hidden > 0) shown.push(`- …and ${hidden} more. Fix the issues above and validate again.`);
  return shown.join("\n");
}
