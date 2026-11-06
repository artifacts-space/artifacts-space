import { isPlainObject, walkJson } from "./json-walk";
import { uiLimits } from "./limits";

/** Keys that turn a prop value into a json-render expression. */
const expressionKeys = new Set(["$state", "$bindState", "$bindItem", "$item", "$index", "$cond", "$template", "$computed"]);

/** Expressions we do not support: `$computed` needs app functions, and we register none. */
export const unsupportedExpressionKeys = new Set(["$computed"]);

/** Keys whose string values are state paths. */
const pathKeys = new Set(["$state", "$bindState", "$bindItem", "$item", "statePath", "clearStatePath"]);

/** Path segments that could reach an object's prototype. */
const forbiddenSegments = new Set(["__proto__", "constructor", "prototype"]);

const templateReference = /\$\{([^}]*)\}/g;

/** True when `value` is an expression object such as { "$state": "/path" }. */
export function isExpression(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).some((key) => expressionKeys.has(key));
}

/** True when `value` holds an expression anywhere inside it. */
export function containsExpression(value: unknown): boolean {
  let found = false;
  walkJson(value, uiLimits.maxJsonDepth, ({ value: item }) => {
    if (!found && isExpression(item)) found = true;
  });
  return found;
}

/** Names of unsupported expression keys used anywhere inside `value`. */
export function unsupportedExpressions(value: unknown): string[] {
  const used = new Set<string>();
  walkJson(value, uiLimits.maxJsonDepth, ({ key }) => {
    if (key && unsupportedExpressionKeys.has(key)) used.add(key);
  });
  return [...used];
}

function hasForbiddenSegment(path: string): boolean {
  return path.split(/[/.]/).some((segment) => forbiddenSegments.has(segment.replaceAll("~1", "/").replaceAll("~0", "~")));
}

function templatePaths(text: string): string[] {
  return [...text.matchAll(templateReference)].map((match) => match[1] ?? "");
}

function isUnsafeString(key: string | null, text: string): boolean {
  if ((key !== null && pathKeys.has(key)) || text.startsWith("/")) {
    if (hasForbiddenSegment(text)) return true;
  }
  return key === "$template" && templatePaths(text).some(hasForbiddenSegment);
}

/**
 * Finds keys and state paths that could reach `__proto__`, `constructor`, or
 * `prototype`. Writing to such a path through a state action could change how
 * every object on the page behaves, so specs that use one are rejected.
 */
export function findUnsafePaths(spec: unknown): string[] {
  const found: string[] = [];
  walkJson(spec, uiLimits.maxJsonDepth, ({ key, value }) => {
    if (key !== null && forbiddenSegments.has(key)) found.push(key);
    if (typeof value === "string" && isUnsafeString(key, value)) found.push(value);
  });
  return found;
}
