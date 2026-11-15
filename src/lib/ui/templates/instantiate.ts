import { containerComponents, isUiComponentName } from "../catalog";
import { findUnsafePaths } from "../expressions";
import { isPlainObject } from "../json-walk";
import { uiLimits } from "../limits";
import { UI_SPEC_VERSION } from "../version";

import { TemplateError, templateBudget, templateNamePattern, type TemplateElement, type TemplateFragment, type TemplateSlot, type UiTemplate } from "./types";

/**
 * Turning a template into something a spec can hold. A template's keys and
 * state paths are short ("title", "/plans"), so two templates, or one used
 * twice, would collide. `instantiateTemplate` gives every element key and
 * every state path a prefix; `templateAsSpec` wraps the result into a
 * complete ui spec; `attachFragment` puts it under an element of a spec an
 * agent already has.
 *
 * Where a key or a path can appear was read from the validator
 * (validate.ts, validate-tree.ts, expressions.ts) and the renderer's
 * actions, not guessed:
 * - element keys: the `elements` map, `root`, and each `children` list;
 * - state paths: `$state` and `$bindState` anywhere in `props`, `visible`,
 *   `repeat`, and `on` (a condition, a `$cond`, an action's value),
 *   `statePath` (a `repeat`, and the params of setState, pushState,
 *   removeState, and validateForm), `clearStatePath` (pushState), and each
 *   `${/path}` inside a `$template` string;
 * - left alone: `$item` and `$bindItem` (a field of the repeat's current
 *   item), a `repeat`'s `key` (an item field), and a bare `${name}` in a
 *   `$template` (the item's field).
 */

/** Keys whose string value is an absolute state path. `$item` and `$bindItem` are relative to a repeat's item and stay as written. */
export const statePathKeys: ReadonlySet<string> = new Set(["$state", "$bindState", "statePath", "clearStatePath"]);

/** An absolute `${/path}` reference inside a `$template` string. The one definition: the rewrite below and the path count in facts.ts both use it. */
const absoluteReference = /\$\{(\/[^}]*)\}/g;

/** The absolute state paths a `$template` string reads, in order. A bare `${name}` (a field of a repeat's item) is not one. */
export function absoluteReferences(text: string): string[] {
  return [...text.matchAll(absoluteReference)].map((match) => match[1] ?? "");
}

/** A template made ready for a spec: every key and state path carries the prefix. */
export interface TemplateInstance extends TemplateFragment {
  /** The prefix every element key (`<prefix>-<key>`) and state path (`/<prefix>/…`) carries. */
  prefix: string;
  /** The template's slots, pointing at the prefixed keys and paths. */
  slots: TemplateSlot[];
}

/** A ui spec as an agent holds it. */
export interface SpecLike {
  version?: number;
  root: string;
  elements: Record<string, TemplateElement>;
  state?: Record<string, unknown>;
}

/** Where a fragment goes in a spec: under `parent`, at `index` among its children (the end when left out). */
export interface AttachPlace {
  parent: string;
  index?: number | undefined;
}

function prefixedPath(path: string, prefix: string): string {
  if (!path.startsWith("/")) return path;
  return path === "/" ? `/${prefix}` : `/${prefix}${path}`;
}

function rewriteString(text: string, key: string | null, prefix: string): string {
  if (key !== null && statePathKeys.has(key)) return prefixedPath(text, prefix);
  if (key === "$template") return text.replace(absoluteReference, (_, path: string) => `\${${prefixedPath(path, prefix)}}`);
  return text;
}

/** A copy of `value` with every state path in it moved under the prefix. `key` is the object key that led to the value. */
function rewritePaths(value: unknown, key: string | null, prefix: string): unknown {
  if (typeof value === "string") return rewriteString(value, key, prefix);
  if (Array.isArray(value)) return value.map((item) => rewritePaths(item, null, prefix));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, rewritePaths(item, name, prefix)]));
}

const prefixedKey = (key: string, prefix: string) => `${prefix}-${key}`;

function rewriteElement(element: TemplateElement, prefix: string): TemplateElement {
  const next: TemplateElement = { type: element.type };
  if (element.props) next.props = rewritePaths(element.props, null, prefix) as Record<string, unknown>;
  if (element.children) next.children = element.children.map((child) => prefixedKey(child, prefix));
  for (const field of ["visible", "repeat", "on"] as const) {
    if (element[field] !== undefined) next[field] = rewritePaths(element[field], null, prefix);
  }
  return next;
}

function rewriteSlot(slot: TemplateSlot, prefix: string): TemplateSlot {
  return "state" in slot ? { what: slot.what, state: prefixedPath(slot.state, prefix) } : { what: slot.what, element: prefixedKey(slot.element, prefix), prop: slot.prop };
}

/** What a prefix turns into in a spec: the one state key, the start of every state path, and the start of every element key. */
function prefixInSpec(prefix: string): unknown {
  return { state: { [prefix]: null }, read: { $state: prefixedPath("/value", prefix) }, elements: { [prefixedKey("key", prefix)]: null } };
}

/**
 * Why `prefix` cannot be used, or null when it can. It must be lowercase
 * words joined by hyphens, up to the id length, and the state key, state
 * paths, and element keys it makes must be ones the ui format accepts. That
 * last check is the format's own (`findUnsafePaths`), not a list kept here.
 */
export function prefixProblem(prefix: string): string | null {
  if (prefix.length > templateBudget.maxIdLength || !templateNamePattern.test(prefix)) {
    return `\`prefix\` must be up to ${String(templateBudget.maxIdLength)} lowercase letters, digits, and hyphens, starting with a letter, such as "hero" or "pricing-2". Got "${prefix.slice(0, 60)}".`;
  }
  if (findUnsafePaths(prefixInSpec(prefix)).length > 0) {
    return `\`prefix\` "${prefix}" would become a state key and state paths a ui spec cannot use. Pass another, such as "hero" or "pricing-2".`;
  }
  return null;
}

/** Throws unless `prefix` can be used (see `prefixProblem`). */
export function assertPrefix(prefix: string): void {
  const problem = prefixProblem(prefix);
  if (problem !== null) throw new TemplateError(problem);
}

/**
 * The template with every element key and state path under `prefix` (the
 * template's id when left out), so it can share a spec with other templates
 * and with a second copy of itself under another prefix. Its state moves
 * under one key, the prefix: `{ plans: [...] }` becomes
 * `{ "<prefix>": { plans: [...] } }`, read at `/<prefix>/plans`.
 */
export function instantiateTemplate(template: UiTemplate, options: { prefix?: string | undefined } = {}): TemplateInstance {
  const prefix = options.prefix ?? template.id;
  assertPrefix(prefix);
  const { fragment } = template;
  const elements = Object.fromEntries(Object.entries(fragment.elements).map(([key, element]) => [prefixedKey(key, prefix), rewriteElement(element, prefix)]));
  const instance: TemplateInstance = { prefix, root: prefixedKey(fragment.root, prefix), elements, slots: template.slots.map((slot) => rewriteSlot(slot, prefix)) };
  if (fragment.state) instance.state = { [prefix]: fragment.state };
  return instance;
}

/** The key of the Box a template is wrapped in when it is handed out as a whole spec. */
export const templatePageKey = "page";

/**
 * The template as a complete ui spec: a root Box (`page`) that paints the
 * surface the template sits on, with the template as its one child. It is
 * ready to save as a ui artifact or as a canvas frame's `spec`, and more
 * templates attach under `page` with `attachFragment`.
 */
export function templateAsSpec(template: UiTemplate, options: { prefix?: string | undefined } = {}): SpecLike & { version: number } {
  const instance = instantiateTemplate(template, options);
  const page: TemplateElement = { type: "Box", props: { direction: "vertical", gap: "none", width: "full", surface: template.surface }, children: [instance.root] };
  const spec: SpecLike & { version: number } = { version: UI_SPEC_VERSION, root: templatePageKey, elements: { [templatePageKey]: page, ...instance.elements } };
  if (instance.state) spec.state = instance.state;
  return spec;
}

/** Containers a fragment may go under: Tabs and Accordion pair each child with an entry, so they are left out. */
function canHold(type: string): boolean {
  return isUiComponentName(type) && containerComponents.has(type) && type !== "Tabs" && type !== "Accordion";
}

function parentOf(spec: SpecLike, key: string): TemplateElement {
  const parent = Object.hasOwn(spec.elements, key) ? spec.elements[key] : undefined;
  if (!parent) throw new TemplateError(`No element has the key "${key}". Pass the key of a Box, Stack, Grid, Card, or Section in your spec as \`parent\`.`);
  if (!canHold(parent.type)) throw new TemplateError(`Element "${key}" is a ${parent.type}, which cannot hold a template. Attach it under a Box, Stack, Grid, Card, or Section.`);
  return parent;
}

function assertNoCollisions(spec: SpecLike, fragment: TemplateFragment): void {
  const taken = Object.keys(fragment.elements).find((key) => Object.hasOwn(spec.elements, key));
  if (taken !== undefined) throw new TemplateError(`The spec already has an element with the key "${taken}". Fetch the template again with another \`prefix\`.`);
  const state = Object.keys(fragment.state ?? {}).find((key) => Object.hasOwn(spec.state ?? {}, key));
  if (state !== undefined) throw new TemplateError(`The spec's state already has the key "${state}". Fetch the template again with another \`prefix\`.`);
  const total = Object.keys(spec.elements).length + Object.keys(fragment.elements).length;
  if (total > uiLimits.maxElements) throw new TemplateError(`The spec would have ${String(total)} elements; the limit is ${String(uiLimits.maxElements)}. Put the template in another frame or artifact.`);
}

/**
 * A copy of `spec` with a fragment attached: its elements and state merged
 * in, and its root added to the children of `place.parent` at `place.index`
 * (the end when left out). Throws, changing nothing, when the parent cannot
 * hold it, a key or state key is already taken, or the spec would pass the
 * element limit. It has no caller in the app yet: it is the merge the web
 * editor's insert picker will call, and the one the guides tell agents to do.
 */
export function attachFragment<T extends SpecLike>(spec: T, fragment: TemplateFragment, place: AttachPlace): T {
  const parent = parentOf(spec, place.parent);
  assertNoCollisions(spec, fragment);
  const children = parent.children ?? [];
  const at = Math.min(Math.max(0, Math.trunc(place.index ?? children.length)), children.length);
  const withRoot = [...children.slice(0, at), fragment.root, ...children.slice(at)];
  const next: T = { ...spec, elements: { ...spec.elements, [place.parent]: { ...parent, children: withRoot }, ...fragment.elements } };
  if (fragment.state) next.state = { ...spec.state, ...fragment.state };
  return next;
}
