import { validateSpec } from "@json-render/core";

import { uiCatalog } from "./catalog";
import { findUnsafePaths } from "./expressions";
import { formatPath, hasErrors, isBlocking, specError, type UiSpecIssue } from "./issues";
import { readJsonInput, readVersionField } from "./json-input";
import { isPlainObject, walkJson } from "./json-walk";
import { uiLimits } from "./limits";
import { normalizeElement, toRendererSpec, type UiElement, type UiSpec } from "./spec";
import { validateElement } from "./validate-element";
import { typedTextIssues } from "./validate-fields";
import { validateTree } from "./validate-tree";
import { migrateUiSpec, UI_SPEC_VERSION } from "./version";

/** The outcome of validating a ui spec. */
export interface UiValidationResult {
  /** True when there are no errors. Warnings are allowed. */
  valid: boolean;
  /** True when the spec can be rendered, possibly with some elements showing a notice. */
  renderable: boolean;
  /** The normalized, migrated spec, or null when it could not be read at all. */
  spec: UiSpec | null;
  issues: UiSpecIssue[];
}

/** json-render issue codes our own checks already report in more detail. */
const coveredCodes = new Set(["missing_root", "root_not_found", "missing_child", "orphaned_element", "empty_spec"]);

/** How a ui spec names itself when its JSON cannot be read. */
const uiInput = {
  maxBytes: uiLimits.maxSpecBytes,
  noun: "spec",
  splitInto: "artifacts",
  shapeHint: `A ui artifact is one JSON object: { "version": ${String(UI_SPEC_VERSION)}, "root": "…", "elements": { … } }.`,
} as const;

function failed(issue: UiSpecIssue): UiValidationResult {
  return { valid: false, renderable: false, spec: null, issues: [issue] };
}

function readElements(raw: Record<string, unknown>): { elements: Record<string, UiElement>; raws: Record<string, Record<string, unknown>>; issues: UiSpecIssue[] } {
  const elements: Record<string, UiElement> = {};
  const raws: Record<string, Record<string, unknown>> = {};
  const issues: UiSpecIssue[] = [];
  if (!isPlainObject(raw.elements)) {
    return { elements, raws, issues: [specError("invalid_elements", `"elements" must be an object that maps element keys to { "type", "props", "children" }.`)] };
  }
  for (const [key, value] of Object.entries(raw.elements)) {
    const element = normalizeElement(value);
    if (element && isPlainObject(value)) {
      elements[key] = element;
      raws[key] = value;
    } else {
      issues.push(specError("invalid_element", `Element "${key}" must be an object with a "type" string, such as { "type": "Text", "props": { "text": "Hello" } }.`, key));
    }
  }
  return { elements, raws, issues };
}

function readRoot(raw: Record<string, unknown>, elements: Record<string, UiElement>): UiSpecIssue[] {
  if (typeof raw.root !== "string" || raw.root === "") {
    return [specError("missing_root", `Set "root" to the key of the top element, for example "root": "page".`)];
  }
  return Object.hasOwn(elements, raw.root) ? [] : [specError("root_not_found", `"root" is "${raw.root}", but no element has that key.`)];
}

function libraryIssues(spec: UiSpec): UiSpecIssue[] {
  const rendererSpec = toRendererSpec(spec);
  const structural = validateSpec(rendererSpec).issues
    .filter((issue) => !coveredCodes.has(issue.code))
    .map((issue): UiSpecIssue => ({ ...issue, message: issue.elementKey ? `Element "${issue.elementKey}": ${issue.message}` : issue.message }));
  const catalog = uiCatalog.validate(rendererSpec);
  const catalogIssues = catalog.success || !catalog.error ? [] : catalog.error.issues
    .filter((issue) => !issue.path.includes("type"))
    .map((issue) => specError("structure", `${formatPath(issue.path)}: ${issue.message}`));
  return [...structural, ...catalogIssues];
}

function checkRaw(raw: Record<string, unknown>): UiSpecIssue | null {
  if (!walkJson(raw, uiLimits.maxJsonDepth, () => undefined)) {
    return specError("too_deep_json", `The spec nests JSON more than ${uiLimits.maxJsonDepth} levels deep. Flatten props and state.`);
  }
  const unsafe = findUnsafePaths(raw);
  if (unsafe.length > 0) {
    return specError("unsafe_path", `Keys and state paths cannot use __proto__, constructor, or prototype (found "${unsafe[0] ?? ""}"). Rename them.`);
  }
  return null;
}

/**
 * Validates a ui artifact: the JSON text (or an already-parsed value), the
 * size and nesting limits, the version, every element's props against the
 * stout catalog, the element tree, and json-render's own structural checks.
 * Issues name the element key and say how to fix the problem.
 */
export function validateUiSpec(input: unknown): UiValidationResult {
  const parsed = readJsonInput(input, uiInput);
  if ("issue" in parsed) return failed(parsed.issue);
  if (!isPlainObject(parsed.value)) {
    return failed(specError("not_object", `A ui artifact must be one JSON object: { "version": ${UI_SPEC_VERSION}, "root": "…", "elements": { … } }.`));
  }
  const rawIssue = checkRaw(parsed.value);
  if (rawIssue) return failed(rawIssue);
  const { version, issue: versionIssue } = readVersionField(parsed.value, UI_SPEC_VERSION, "so the spec keeps its meaning as components evolve");
  const read = readSpec(migrateUiSpec(parsed.value, version));
  if (versionIssue) read.issues.unshift(versionIssue);
  if (!read.spec) return { valid: false, renderable: false, spec: null, issues: read.issues };
  return checkSpec(read.spec, read.raws, read.issues);
}

interface ReadSpec {
  spec: UiSpec | null;
  raws: Record<string, Record<string, unknown>>;
  issues: UiSpecIssue[];
}

/** Reads elements, root, and state from a raw spec. `spec` is null when the element limit is crossed. */
function readSpec(raw: Record<string, unknown>): ReadSpec {
  const { elements, raws, issues } = readElements(raw);
  const count = Object.keys(elements).length;
  if (count > uiLimits.maxElements) {
    issues.push(specError("too_many_elements", `The spec has ${count} elements; the limit is ${uiLimits.maxElements}. Use Table or List for long data instead of one element per item.`));
    return { spec: null, raws, issues };
  }
  issues.push(...readRoot(raw, elements));
  const spec: UiSpec = { version: UI_SPEC_VERSION, root: typeof raw.root === "string" ? raw.root : "", elements };
  if (isPlainObject(raw.state)) spec.state = raw.state;
  else if (raw.state !== undefined) issues.push(specError("invalid_state", `"state" must be an object, such as { "filters": { "open": true } }.`));
  return { spec, raws, issues };
}

/** Runs the element, tree, and library checks on a readable spec. */
function checkSpec(spec: UiSpec, raws: Record<string, Record<string, unknown>>, issues: UiSpecIssue[]): UiValidationResult {
  for (const [key, element] of Object.entries(spec.elements)) issues.push(...validateElement(key, element, raws[key] ?? {}));
  const hasRoot = Object.hasOwn(spec.elements, spec.root);
  if (hasRoot) issues.push(...validateTree(spec), ...libraryIssues(spec));
  issues.push(...typedTextIssues(spec));
  return { valid: !hasErrors(issues), renderable: hasRoot && !issues.some(isBlocking), spec, issues };
}
