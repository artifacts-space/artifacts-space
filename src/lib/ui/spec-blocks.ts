import { isPlainObject } from "./json-walk";
import { pairedChildren } from "./props/layout";

/**
 * Block operations for the interface editor: each takes a raw ui spec (the
 * parsed JSON, with every field the author wrote) and returns a new one,
 * never changing its input. They keep the spec's shape: every element sits
 * under one parent, a removed element takes its subtree with it, and the
 * labels of Tabs and Accordion stay paired one to one with their children.
 * The editor still checks every result with validateArtifactContent before
 * it keeps it, so an operation can never store an invalid spec.
 */

/** One element as written: its type, props, children, and any other field. */
export type RawElement = Record<string, unknown> & { type: string };

/** A ui spec as written, with every top-level field kept. */
export type RawSpec = Record<string, unknown> & { root: string; elements: Record<string, RawElement> };

/** Where an element sits: its parent's key and its index among the parent's children. */
export interface BlockPlace {
  parent: string;
  index: number;
}

/** Reads a spec from text for editing, or null when it is not a spec with a root and elements. */
export function readRawSpec(content: string): RawSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || typeof parsed.root !== "string" || !isPlainObject(parsed.elements)) return null;
  const elements: Record<string, RawElement> = {};
  for (const [key, value] of Object.entries(parsed.elements)) {
    if (!isPlainObject(value) || typeof value.type !== "string") return null;
    elements[key] = { ...value, type: value.type };
  }
  return { ...parsed, root: parsed.root, elements };
}

/** The spec as text, two-space indented like the specs agents write. */
export function writeRawSpec(spec: RawSpec): string {
  return JSON.stringify(spec, null, 2);
}

/** The child keys of an element; an element without children has none. */
export function childrenOf(spec: RawSpec, key: string): string[] {
  const children = spec.elements[key]?.children;
  return Array.isArray(children) ? children.filter((child): child is string => typeof child === "string") : [];
}

/** The props of an element as written; none when they are missing. */
export function propsOf(spec: RawSpec, key: string): Record<string, unknown> {
  const props = spec.elements[key]?.props;
  return isPlainObject(props) ? props : {};
}

/** Where `key` sits, or null for the root and for elements under no parent. */
export function placeOf(spec: RawSpec, key: string): BlockPlace | null {
  for (const parent of Object.keys(spec.elements)) {
    const index = childrenOf(spec, parent).indexOf(key);
    if (index !== -1) return { parent, index };
  }
  return null;
}

/** `key` and every element under it. */
export function subtreeOf(spec: RawSpec, key: string): string[] {
  const seen = new Set<string>();
  const stack = [key];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next) || !spec.elements[next]) continue;
    seen.add(next);
    stack.push(...childrenOf(spec, next));
  }
  return [...seen];
}

/** A key no element uses yet, built from `base` (such as "heading-2"). */
export function uniqueKey(spec: RawSpec, base: string): string {
  const stem = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "block";
  if (!spec.elements[stem]) return stem;
  for (let count = 2; ; count++) {
    const key = `${stem}-${String(count)}`;
    if (!spec.elements[key]) return key;
  }
}

function withElement(spec: RawSpec, key: string, element: RawElement): RawSpec {
  return { ...spec, elements: { ...spec.elements, [key]: element } };
}

function withChildren(spec: RawSpec, key: string, children: string[]): RawSpec {
  const element = spec.elements[key];
  if (!element) return spec;
  return withElement(spec, key, { ...element, children });
}

/** Sets one prop of an element; `undefined` removes it. */
export function setProp(spec: RawSpec, key: string, name: string, value: unknown): RawSpec {
  const element = spec.elements[key];
  if (!element) return spec;
  const kept = Object.entries(propsOf(spec, key)).filter(([prop]) => prop !== name);
  const props = Object.fromEntries(value === undefined ? kept : [...kept, [name, value]]);
  return withElement(spec, key, { ...element, props });
}

/** The paired-label prop of a Tabs or Accordion element, or null for every other type. */
function pairedProp(spec: RawSpec, key: string): "tabs" | "items" | null {
  const type = spec.elements[key]?.type;
  if (type === "Tabs" || type === "Accordion") return pairedChildren[type];
  return null;
}

function pairedEntries(spec: RawSpec, key: string, prop: string): unknown[] {
  const entries: unknown = propsOf(spec, key)[prop];
  return Array.isArray(entries) ? entries.map((entry: unknown) => entry) : [];
}

/** The label a new Tabs or Accordion child gets. */
function newPairedEntry(prop: "tabs" | "items"): Record<string, string> {
  return prop === "tabs" ? { label: "New tab" } : { title: "New item" };
}

/** Takes `key` out of its parent (and its paired label with it). Returns the spec and the label removed. */
function detach(spec: RawSpec, key: string): { spec: RawSpec; entry: unknown } {
  const place = placeOf(spec, key);
  if (!place) return { spec, entry: undefined };
  const children = childrenOf(spec, place.parent);
  children.splice(place.index, 1);
  let next = withChildren(spec, place.parent, children);
  const prop = pairedProp(spec, place.parent);
  if (!prop) return { spec: next, entry: undefined };
  const entries = pairedEntries(next, place.parent, prop);
  const [entry] = entries.splice(place.index, 1);
  next = setProp(next, place.parent, prop, entries);
  return { spec: next, entry };
}

/** Puts `key` into `parent` at `index` (clamped), with a paired label when the parent needs one. */
function attach(spec: RawSpec, key: string, parent: string, index: number, entry: unknown): RawSpec {
  const children = childrenOf(spec, parent);
  const at = Math.max(0, Math.min(index, children.length));
  children.splice(at, 0, key);
  let next = withChildren(spec, parent, children);
  const prop = pairedProp(spec, parent);
  if (!prop) return next;
  const entries = pairedEntries(next, parent, prop);
  entries.splice(at, 0, isPlainObject(entry) ? entry : newPairedEntry(prop));
  next = setProp(next, parent, prop, entries);
  return next;
}

/**
 * Moves `key` to `index` among `parent`'s children, where `index` counts the
 * children before the move. Returns null for the root, and for a move into
 * the element itself or anything under it.
 */
export function moveBlock(spec: RawSpec, key: string, parent: string, index: number): RawSpec | null {
  const place = placeOf(spec, key);
  if (!place || !spec.elements[parent] || subtreeOf(spec, key).includes(parent)) return null;
  const target = place.parent === parent && place.index < index ? index - 1 : index;
  if (place.parent === parent && place.index === target) return spec;
  const detached = detach(spec, key);
  return attach(detached.spec, key, parent, target, detached.entry);
}

/** Moves `key` one place up (-1) or down (+1) among its siblings; null when it cannot move that way. */
export function nudgeBlock(spec: RawSpec, key: string, step: -1 | 1): RawSpec | null {
  const place = placeOf(spec, key);
  if (!place) return null;
  const target = place.index + step;
  if (target < 0 || target >= childrenOf(spec, place.parent).length) return null;
  return moveBlock(spec, key, place.parent, step === 1 ? target + 1 : target);
}

/** Copies `key`'s subtree under fresh keys, mapping every child reference to its copy. */
function copySubtree(spec: RawSpec, key: string): { spec: RawSpec; key: string } {
  const keys = subtreeOf(spec, key);
  let next = spec;
  const renamed = new Map<string, string>();
  for (const old of keys) {
    const fresh = uniqueKey(next, `${old}-copy`);
    renamed.set(old, fresh);
    // Reserve the key so the next copy cannot take it.
    next = withElement(next, fresh, { type: "Text" });
  }
  for (const old of keys) {
    const element = spec.elements[old];
    const fresh = renamed.get(old);
    if (!element || !fresh) continue;
    const copy: RawElement = structuredClone(element);
    if (Array.isArray(element.children)) copy.children = childrenOf(spec, old).map((child) => renamed.get(child) ?? child);
    next = withElement(next, fresh, copy);
  }
  return { spec: next, key: renamed.get(key) ?? key };
}

/** Duplicates `key` and everything under it, right after it. Null for the root. */
export function duplicateBlock(spec: RawSpec, key: string): { spec: RawSpec; key: string } | null {
  const place = placeOf(spec, key);
  if (!place) return null;
  const copied = copySubtree(spec, key);
  const prop = pairedProp(spec, place.parent);
  const entry = prop ? pairedEntries(spec, place.parent, prop)[place.index] : undefined;
  return { spec: attach(copied.spec, copied.key, place.parent, place.index + 1, structuredClone(entry)), key: copied.key };
}

/** Removes `key` and everything under it. Null for the root, which always stays. */
export function deleteBlock(spec: RawSpec, key: string): RawSpec | null {
  if (key === spec.root || !spec.elements[key]) return null;
  const doomed = new Set(subtreeOf(spec, key));
  const detached = detach(spec, key).spec;
  const elements = Object.fromEntries(Object.entries(detached.elements).filter(([name]) => !doomed.has(name)));
  return { ...detached, elements };
}

/** A new block: its element and, for containers, its child blocks in order. */
export interface NewBlock {
  element: RawElement;
  children?: RawElement[] | undefined;
}

/** Writes `block` under `key`, with its child blocks under fresh keys. */
function placeNew(spec: RawSpec, key: string, block: NewBlock): RawSpec {
  // Reserve the key first, so no child takes it.
  let next = withElement(spec, key, { type: block.element.type });
  const childKeys: string[] = [];
  for (const child of block.children ?? []) {
    const childKey = uniqueKey(next, child.type);
    next = withElement(next, childKey, { ...child, children: [] });
    childKeys.push(childKey);
  }
  return withElement(next, key, { ...block.element, children: childKeys });
}

/** Adds a new block under `parent` at `index`, with a key built from its type. */
export function insertBlock(spec: RawSpec, parent: string, index: number, block: NewBlock): { spec: RawSpec; key: string } | null {
  if (!spec.elements[parent]) return null;
  const key = uniqueKey(spec, block.element.type);
  return { spec: attach(placeNew(spec, key, block), key, parent, index, undefined), key };
}

/**
 * Swaps the element at `key` for a new block in the same place, such as an
 * empty line turned into a heading from the "/" menu. Only an element with
 * no children of its own can be swapped.
 */
export function replaceBlock(spec: RawSpec, key: string, block: NewBlock): RawSpec | null {
  if (!spec.elements[key] || childrenOf(spec, key).length > 0) return null;
  return placeNew(spec, key, block);
}

/**
 * Makes sure the root can hold more than one block: a root that is not a
 * container goes inside a new vertical Stack, which becomes the root.
 */
export function withContainerRoot(spec: RawSpec, isContainer: (type: string) => boolean): RawSpec {
  const root = spec.elements[spec.root];
  if (!root || isContainer(root.type)) return spec;
  const key = uniqueKey(spec, "page");
  return { ...withElement(spec, key, { type: "Stack", props: {}, children: [spec.root] }), root: key };
}
