import { specError, specWarning, type UiSpecIssue } from "./issues";
import { isPlainObject, readPointer } from "./json-walk";
import { uiLimits } from "./limits";
import type { UiSpec } from "./spec";

/** Most elements a spec may render once repeats are expanded. */
export const maxRenderedElements = 5000;

interface Frame {
  key: string;
  depth: number;
  multiplier: number;
  inRepeat: boolean;
}

function childReferenceIssues(spec: UiSpec): UiSpecIssue[] {
  const issues: UiSpecIssue[] = [];
  const parentOf = new Map<string, string>();
  for (const [key, element] of Object.entries(spec.elements)) {
    for (const child of element.children) {
      if (!Object.hasOwn(spec.elements, child)) {
        issues.push(specError("missing_child", `Element "${key}" lists child "${child}", but no element has that key. Add the element or remove it from children.`, key));
      } else if (child === spec.root) {
        issues.push(specError("root_is_child", `Element "${key}" lists the root "${child}" as a child. The root cannot be inside another element.`, key));
      } else if (parentOf.has(child)) {
        issues.push(specError("shared_child", `Element "${child}" appears in the children of both "${parentOf.get(child) ?? key}" and "${key}". Each element can have one place; copy it under a new key.`, child));
      } else {
        parentOf.set(child, key);
      }
    }
  }
  return issues;
}

/** Number of items a repeat renders, or null when its state path is not a plain array. */
function repeatLength(spec: UiSpec, repeat: unknown): number | null {
  if (!isPlainObject(repeat) || typeof repeat.statePath !== "string") return null;
  const items = readPointer(spec.state ?? {}, repeat.statePath);
  return Array.isArray(items) ? items.length : null;
}

function repeatIssues(spec: UiSpec, frame: Frame, repeat: unknown): { issues: UiSpecIssue[]; multiplier: number } {
  if (repeat === undefined) return { issues: [], multiplier: frame.multiplier };
  if (frame.inRepeat) {
    return { issues: [specError("nested_repeat", `Element "${frame.key}": a repeat inside another repeat is not supported. Flatten the data into one state array.`, frame.key)], multiplier: frame.multiplier };
  }
  const length = repeatLength(spec, repeat) ?? 0;
  const issues = length > uiLimits.maxRepeatItems
    ? [specError("repeat_too_long", `Element "${frame.key}" repeats ${length} items; the limit is ${uiLimits.maxRepeatItems}. Show fewer items or use a Table.`, frame.key)]
    : [];
  return { issues, multiplier: frame.multiplier * Math.max(length, 1) };
}

/**
 * Walks the element tree from the root without recursion. Checks child
 * references, single parents, depth, repeats, the rendered-element budget,
 * and reports elements the root never reaches.
 */
interface Walk {
  issues: UiSpecIssue[];
  visited: Set<string>;
  stack: Frame[];
  rendered: number;
  tooDeep: boolean;
}

function visitFrame(spec: UiSpec, walk: Walk, frame: Frame) {
  const element = spec.elements[frame.key];
  if (!element || walk.visited.has(frame.key)) return;
  walk.visited.add(frame.key);
  if (frame.depth > uiLimits.maxDepth) {
    if (!walk.tooDeep) walk.issues.push(specError("too_deep", `Element "${frame.key}" is nested ${frame.depth} levels deep; the limit is ${uiLimits.maxDepth}. Flatten the layout.`, frame.key));
    walk.tooDeep = true;
    return;
  }
  walk.rendered += frame.multiplier;
  const repeat = repeatIssues(spec, frame, element.repeat);
  walk.issues.push(...repeat.issues);
  const inRepeat = frame.inRepeat || element.repeat !== undefined;
  for (const child of element.children) {
    walk.stack.push({ key: child, depth: frame.depth + 1, multiplier: repeat.multiplier, inRepeat });
  }
}

export function validateTree(spec: UiSpec): UiSpecIssue[] {
  const walk: Walk = {
    issues: childReferenceIssues(spec),
    visited: new Set<string>(),
    stack: [{ key: spec.root, depth: 1, multiplier: 1, inRepeat: false }],
    rendered: 0,
    tooDeep: false,
  };
  for (let frame = walk.stack.pop(); frame; frame = walk.stack.pop()) visitFrame(spec, walk, frame);
  const { issues, visited, rendered, tooDeep } = walk;
  if (rendered > maxRenderedElements) {
    issues.push(specError("too_many_rendered", `The spec renders about ${rendered.toLocaleString("en-US")} elements once repeats expand; the limit is ${maxRenderedElements.toLocaleString("en-US")}. Repeat fewer items or simplify the repeated elements.`));
  }
  const orphans = Object.keys(spec.elements).filter((key) => !visited.has(key));
  if (orphans.length > 0 && !tooDeep) {
    issues.push(specWarning("orphaned_element", `Elements not reachable from the root are ignored: ${orphans.slice(0, 10).join(", ")}${orphans.length > 10 ? ", …" : ""}.`));
  }
  return issues;
}
