import { isPlainObject, readPointer } from "../json-walk";

import type { TemplateElement, TemplateFragment, UiTemplate } from "./types";

/**
 * What a template does when a reader uses it, read from its fragment: the
 * buttons whose press changes state, what each one changes, the button that
 * puts it back, and the words every link, button, and picture is drawn with.
 * The shared e2e loop (e2e/templates-behavior.spec.ts) presses and counts from these
 * lists, so no template needs a hand-written list of its own, and
 * rules.ts checks the hide steps from the same reading.
 */

/**
 * Actions that change state. A press with one of them can show, hide, or
 * change something: setState writes a value to a path, pushState adds an
 * item to the end of a list, and removeState takes one item out of a list.
 */
const stateActionNames = ["setState", "pushState", "removeState"] as const;

/** An action that changes state. */
export type StateAction = (typeof stateActionNames)[number];

const isStateAction = (action: unknown): action is StateAction => stateActionNames.some((name) => name === action);

/**
 * Why no press undoes another, by the action it runs. A setState is one-way
 * when no button writes the starting value back. A push or a remove is
 * one-way for a reader of the fragment whatever else the template holds: a
 * remove takes the item at one place in the list, and which place depends
 * on the copy of the button a reader presses (inside a repeat it is that
 * row's own), so the fragment cannot name a press that takes away exactly
 * the item a push added, or puts back the one a remove took.
 */
export const oneWayReasons: Readonly<Record<StateAction, string>> = {
  setState: "no button writes the starting value back",
  pushState: "it adds an item to a list, and the fragment cannot name a press that takes away exactly that item",
  removeState: "it takes an item out of a list, and no press puts that item back",
};

/** Components a reader acts on by pressing: the things that must stay reachable at every width. */
const actionTypes: ReadonlySet<string> = new Set(["Link", "Button"]);

/** Components that draw a named picture. */
const pictureTypes: ReadonlySet<string> = new Set(["Placeholder", "Image"]);

/** A button whose press changes the template's state. */
export interface PressButton {
  /** The element's key in the fragment. */
  key: string;
  /** The words the button is found by: its label, which is also its name when it shows only an icon. */
  label: string;
  /** What its press does to the state: write a value, add an item to a list, or take one out. */
  action: StateAction;
  /** The state path its press changes, and the value a setState writes there or a pushState adds. */
  statePath: string;
  value: unknown;
  /**
   * True when pressing it first changes the state the template starts with:
   * a setState that writes something other than the path's starting value,
   * any pushState, and a removeState whose list starts with an item to take.
   */
  changesStart: boolean;
  /**
   * The labels of the buttons whose press writes the starting value back to
   * the same path (a "Close menu" for an "Open menu"). Several can: a menu
   * may have one closing button for wide frames and one for narrow ones, and
   * the browser shows which. Empty when nothing in the template undoes the
   * press (a form's send button), when the press writes the starting value
   * itself, and for every push and remove (see `oneWay`).
   */
  restoredBy: string[];
  /**
   * Why no press undoes this one, when none does (oneWayReasons): the e2e
   * loop then checks that the press changes its frame and ends there. Null
   * when `restoredBy` names a button, and for a setState that writes the
   * starting value, which changes nothing to undo.
   */
  oneWay: string | null;
}

/** One state-changing binding of an element's `press`. */
interface StateWrite {
  key: string;
  action: StateAction;
  statePath: string;
  value: unknown;
  /** The place in the list a removeState takes from, as written: a number, or `{ $index: true }` inside a repeat. */
  index: unknown;
}

function pressBindings(element: TemplateElement): unknown[] {
  if (!isPlainObject(element.on)) return [];
  const press = element.on.press;
  if (press === undefined) return [];
  return Array.isArray(press) ? press : [press];
}

function stateWrites(fragment: TemplateFragment): StateWrite[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) =>
    pressBindings(element).flatMap((binding): StateWrite[] => {
      if (!isPlainObject(binding) || !isStateAction(binding.action)) return [];
      const params = isPlainObject(binding.params) ? binding.params : {};
      return typeof params.statePath === "string" ? [{ key, action: binding.action, statePath: params.statePath, value: params.value, index: params.index }] : [];
    }),
  );
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const staticLabel = (element: TemplateElement | undefined) => (typeof element?.props?.label === "string" ? element.props.label : null);

/** True when a press changes the state the template starts with. */
function changesStart(fragment: TemplateFragment, write: StateWrite): boolean {
  const start: unknown = readPointer(fragment.state ?? {}, write.statePath);
  if (write.action === "pushState") return true;
  if (write.action === "setState") return !sameValue(write.value, start);
  if (!Array.isArray(start)) return false;
  return typeof write.index === "number" ? write.index >= 0 && write.index < start.length : start.length > 0;
}

/** The labels of the buttons that write a path's starting value back, for a setState that changed it. A push or a remove has none (oneWayReasons). */
function restorersOf(fragment: TemplateFragment, writes: readonly StateWrite[], write: StateWrite): string[] {
  const start = readPointer(fragment.state ?? {}, write.statePath);
  if (write.action !== "setState" || sameValue(write.value, start)) return [];
  const undoes = (other: StateWrite) => other.key !== write.key && other.action === "setState" && other.statePath === write.statePath && sameValue(other.value, start);
  const labels = writes.filter(undoes).map((other) => staticLabel(fragment.elements[other.key])).filter((label): label is string => label !== null);
  return [...new Set(labels)];
}

/**
 * Every element whose press changes state, with the buttons that undo it.
 * `unlabelled` lists the keys of such elements that have no fixed label (it
 * comes from a repeat's item, say), which the e2e loop cannot find by name.
 */
export function pressButtons(template: UiTemplate): { buttons: PressButton[]; unlabelled: string[] } {
  const { fragment } = template;
  const writes = stateWrites(fragment);
  const buttons: PressButton[] = [];
  const unlabelled: string[] = [];
  for (const write of writes) {
    const label = staticLabel(fragment.elements[write.key]);
    if (label === null) {
      unlabelled.push(write.key);
      continue;
    }
    const changes = changesStart(fragment, write);
    const restoredBy = restorersOf(fragment, writes, write);
    // A push or a remove is one-way even where it changes nothing yet: a remove on a list that starts empty acts once a push has filled it.
    const oneWay = restoredBy.length === 0 && (changes || write.action !== "setState") ? oneWayReasons[write.action] : null;
    buttons.push({ key: write.key, label, action: write.action, statePath: write.statePath, value: write.value, changesStart: changes, restoredBy, oneWay });
  }
  return { buttons, unlabelled };
}

/** Each element's parent, by key. */
function parentsOf(fragment: TemplateFragment): Map<string, string> {
  const parents = new Map<string, string>();
  for (const [key, element] of Object.entries(fragment.elements)) {
    for (const child of element.children ?? []) parents.set(child, key);
  }
  return parents;
}

/** The list a repeat above `key` draws from, or undefined when the element is not inside a repeat. */
function repeatedItems(fragment: TemplateFragment, parents: Map<string, string>, key: string): unknown[] | undefined {
  const seen = new Set<string>();
  for (let at = parents.get(key); at !== undefined && !seen.has(at); at = parents.get(at)) {
    seen.add(at);
    const repeat = fragment.elements[at]?.repeat;
    if (isPlainObject(repeat) && typeof repeat.statePath === "string") {
      const items: unknown = readPointer(fragment.state ?? {}, repeat.statePath);
      return Array.isArray(items) ? (items as unknown[]) : [];
    }
  }
  return undefined;
}

/** A field of a repeat's item: "label", or a nested "a/b". */
function itemField(item: unknown, field: string): unknown {
  return field === "" ? item : readPointer(item, `/${field}`);
}

const reference = /\$\{([^}]*)\}/g;

const asText = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

/** A `$template` string with each reference filled in: `${/path}` from the state, a bare `${name}` from `item`. */
function filled(template: string, state: unknown, item: unknown): string {
  return template.replace(reference, (_, name: string) => asText(name.startsWith("/") ? readPointer(state, name) : itemField(item, name)));
}

const strings = (values: readonly unknown[]) => values.filter((text): text is string => typeof text === "string");

/** A label that reads a repeat's item, once per item of the repeat above `key`; null outside a repeat. */
function perItem(read: (item: unknown) => unknown, fragment: TemplateFragment, parents: Map<string, string>, key: string): string[] | null {
  const items = repeatedItems(fragment, parents, key);
  return items ? strings(items.map(read)) : null;
}

/** The words of a `$template` label: one string when it reads only state, one per item when it reads a repeat's item. */
function templateWords(template: string, fragment: TemplateFragment, parents: Map<string, string>, key: string): string[] | null {
  const state = fragment.state ?? {};
  const readsItem = [...template.matchAll(reference)].some((match) => !(match[1] ?? "").startsWith("/"));
  return readsItem ? perItem((item) => filled(template, state, item), fragment, parents, key) : [filled(template, state, undefined)];
}

/**
 * The words a label is drawn with: itself when it is written in the
 * template, one string per item when it reads a repeat's item, the state's
 * value when it reads state, and a `$template` with its references filled
 * in. Null when it is built some other way (a `$cond`), which only the
 * browser can resolve.
 */
function wordsOf(label: unknown, fragment: TemplateFragment, parents: Map<string, string>, key: string): string[] | null {
  if (typeof label === "string") return [label];
  if (!isPlainObject(label)) return null;
  const { $item: field, $state: path, $template: template } = label;
  if (typeof field === "string") return perItem((item) => itemField(item, field), fragment, parents, key);
  if (typeof path === "string") return strings([readPointer(fragment.state ?? {}, path)]);
  return typeof template === "string" ? templateWords(template, fragment, parents, key) : null;
}

/** The labels a template's elements of some types are drawn with, each once, and the keys whose label could not be read. */
function labelsOf(template: UiTemplate, types: ReadonlySet<string>): { labels: string[]; unread: string[] } {
  const { fragment } = template;
  const parents = parentsOf(fragment);
  const labels = new Set<string>();
  const unread: string[] = [];
  for (const [key, element] of Object.entries(fragment.elements)) {
    if (!types.has(element.type) || element.props?.label === undefined) continue;
    const words = wordsOf(element.props.label, fragment, parents, key);
    if (words === null) unread.push(key);
    for (const text of words ?? []) if (text.trim() !== "") labels.add(text.trim());
  }
  return { labels: [...labels], unread };
}

/** The label of every link and button a template can draw, each once. `unread` lists elements whose label only the browser can resolve. */
export function actionLabels(template: UiTemplate): { labels: string[]; unread: string[] } {
  return labelsOf(template, actionTypes);
}

/** The label of every named picture a template can draw, each once. */
export function pictureLabels(template: UiTemplate): string[] {
  return labelsOf(template, pictureTypes).labels;
}

/** True when a link or button sits at or under `key`. */
function holdsAction(fragment: TemplateFragment, key: string): boolean {
  const seen = new Set<string>();
  const stack = [key];
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    const element = Object.hasOwn(fragment.elements, at) ? fragment.elements[at] : undefined;
    if (!element || seen.has(at)) continue;
    seen.add(at);
    if (actionTypes.has(element.type)) return true;
    stack.push(...(element.children ?? []));
  }
  return false;
}

/** A Box that hides links or buttons below or above a width step. */
export interface ActionHide {
  key: string;
  side: "hideBelow" | "hideAbove";
  step: string;
}

/** Every Box that hides at a width step and holds a link or a button. */
export function actionHides(fragment: TemplateFragment): ActionHide[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) =>
    (["hideBelow", "hideAbove"] as const).flatMap((side): ActionHide[] => {
      const step = element.props?.[side];
      return typeof step === "string" && holdsAction(fragment, key) ? [{ key, side, step }] : [];
    }),
  );
}
