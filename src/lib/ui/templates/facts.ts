import { walkJson } from "../json-walk";
import { uiLimits } from "../limits";

import { statePathKeys } from "./instantiate";
import type { TemplateElement, TemplateFragment, UiTemplate } from "./types";

/**
 * What can be counted from a template's fragment, so nobody writes it by
 * hand: how many elements it has, how deep it nests, which components it
 * uses, which state paths it reads or writes, and whether a reader can
 * change anything in it.
 */
export interface TemplateFacts {
  /** Elements in the fragment. */
  elements: number;
  /** Deepest nesting from the fragment's root (the root is 1). */
  depth: number;
  /** Component types used, sorted. */
  components: string[];
  /** Absolute state paths the fragment reads or writes, sorted. */
  statePaths: string[];
  /** True when a reader can change something: an input bound to state, or an `on` action. */
  interactive: boolean;
}

const absoluteReference = /\$\{(\/[^}]*)\}/g;

/** The parts of an element that can hold expressions and paths. */
function dynamicParts(element: TemplateElement): unknown[] {
  return [element.props, element.visible, element.repeat, element.on].filter((part) => part !== undefined);
}

/** Every absolute state path an element names. */
export function elementStatePaths(element: TemplateElement): string[] {
  const paths: string[] = [];
  walkJson(dynamicParts(element), uiLimits.maxJsonDepth, ({ key, value }) => {
    if (typeof value !== "string" || key === null) return;
    if (statePathKeys.has(key) && value.startsWith("/")) paths.push(value);
    if (key === "$template") paths.push(...[...value.matchAll(absoluteReference)].map((match) => match[1] ?? ""));
  });
  return paths;
}

function usesKey(element: TemplateElement, name: string): boolean {
  let found = false;
  walkJson(dynamicParts(element), uiLimits.maxJsonDepth, ({ key }) => {
    if (key === name) found = true;
  });
  return found;
}

/** Deepest nesting from the root, walked without recursion. A key seen twice is not walked again, so a cycle ends. */
export function fragmentDepth(fragment: TemplateFragment): number {
  const seen = new Set<string>();
  const stack = [{ key: fragment.root, depth: 1 }];
  let deepest = 0;
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const element = Object.hasOwn(fragment.elements, frame.key) ? fragment.elements[frame.key] : undefined;
    if (!element || seen.has(frame.key)) continue;
    seen.add(frame.key);
    deepest = Math.max(deepest, frame.depth);
    for (const child of element.children ?? []) stack.push({ key: child, depth: frame.depth + 1 });
  }
  return deepest;
}

/** The facts of one template, counted from its fragment. */
export function templateFacts(template: UiTemplate): TemplateFacts {
  const elements = Object.values(template.fragment.elements);
  return {
    elements: elements.length,
    depth: fragmentDepth(template.fragment),
    components: [...new Set(elements.map((element) => element.type))].sort(),
    statePaths: [...new Set(elements.flatMap(elementStatePaths))].sort(),
    interactive: elements.some((element) => element.on !== undefined || usesKey(element, "$bindState")),
  };
}
