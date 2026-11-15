import { isPlainObject, readPointer, walkJson } from "../json-walk";
import { uiLimits } from "../limits";
import { validateUiSpec } from "../validate";

import { actionHides, actionLabels, pressButtons } from "./behavior";
import { elementStatePaths, templateFacts } from "./facts";
import { prefixProblem, templateAsSpec } from "./instantiate";
import { templateBudget, templateCategories, templateNamePattern, type TemplateElement, type TemplateFile, type TemplateFragment, type UiTemplate } from "./types";

/**
 * The rules every template keeps, as one function that names each problem.
 * The shared test runs it over every template in the index, so a batch file
 * needs no validity tests of its own.
 */

/** Components that need an upload. A template uses Placeholder instead. */
const uploadComponents: ReadonlySet<string> = new Set(["Image", "File"]);

/** Hosts a template's links may point at: the reserved example domains. */
const exampleLink = /^https:\/\/(?:www\.)?example\.(?:com|org|net)(?:\/|$)/;

/** A bare `${name}` reference in a `$template` string: a field of the repeat's current item. */
const bareReference = /\$\{(?!\/)[^}]*\}/;

/** An id is also the default prefix, so it must be one `ui_template_get` would accept as `prefix`. */
const validId = (id: string) => prefixProblem(id) === null;

function idProblems({ id, category }: UiTemplate, file: TemplateFile): string[] {
  const problems: string[] = [];
  if (!validId(id)) problems.push(`id "${id}" must be up to ${String(templateBudget.maxIdLength)} lowercase letters, digits, and hyphens, and usable as a prefix.`);
  if (!id.startsWith(`${category}-`)) problems.push(`id "${id}" must start with its category, "${category}-".`);
  if (templateCategories[category].file !== file) problems.push(`category "${category}" belongs in ${templateCategories[category].file}.ts, not ${file}.ts.`);
  return problems;
}

function wordProblems({ name, description, slots }: UiTemplate): string[] {
  const problems: string[] = [];
  if (name.trim() === "" || name.length > templateBudget.maxNameLength) problems.push(`name must be 1 to ${String(templateBudget.maxNameLength)} characters.`);
  if (description.trim() === "" || description.length > templateBudget.maxDescriptionLength || !description.endsWith(".")) {
    problems.push(`description must be one sentence of up to ${String(templateBudget.maxDescriptionLength)} characters that ends with a period.`);
  }
  if (slots.length === 0) problems.push("slots is empty: name the text and lists an agent is expected to change.");
  return problems;
}

function keyProblems(fragment: TemplateFragment): string[] {
  return Object.keys(fragment.elements)
    .filter((key) => !templateNamePattern.test(key) || key.length > templateBudget.maxKeyLength)
    .map((key) => `element key "${key}" must be up to ${String(templateBudget.maxKeyLength)} lowercase letters, digits, and hyphens.`);
}

function budgetProblems(template: UiTemplate): string[] {
  const facts = templateFacts(template);
  const problems: string[] = [];
  if (facts.elements > templateBudget.maxElements) problems.push(`${String(facts.elements)} elements; the budget is ${String(templateBudget.maxElements)}. Move list content into state and draw it with one repeat.`);
  if (facts.depth > templateBudget.maxDepth) problems.push(`nested ${String(facts.depth)} levels deep; the budget is ${String(templateBudget.maxDepth)}.`);
  return problems;
}

/** The root is a Box, and when it paints a surface it is the one the template says it sits on. */
function rootProblems({ fragment, surface }: UiTemplate): string[] {
  const root = Object.hasOwn(fragment.elements, fragment.root) ? fragment.elements[fragment.root] : undefined;
  if (root?.type !== "Box") return [`root "${fragment.root}" must be a Box, so the template brings its own padding and surface.`];
  const painted = root.props?.surface;
  if (typeof painted !== "string" || painted === "none" || painted === surface) return [];
  return [`the root paints surface "${painted}" but the template says "${surface}". Make them the same.`];
}

/** The first Heading a reader meets, walking the fragment from its root in order; undefined when it has none. */
function firstHeading(fragment: TemplateFragment): TemplateElement | undefined {
  const seen = new Set<string>();
  const stack = [fragment.root];
  for (let key = stack.pop(); key !== undefined; key = stack.pop()) {
    const element = Object.hasOwn(fragment.elements, key) ? fragment.elements[key] : undefined;
    if (!element || seen.has(key)) continue;
    seen.add(key);
    if (element.type === "Heading") return element;
    stack.push(...[...(element.children ?? [])].reverse());
  }
  return undefined;
}

/** Sections stack: when each starts at level 1 or 2, any order of them keeps a heading outline with no skipped level. */
function outlineProblems(fragment: TemplateFragment): string[] {
  const level = firstHeading(fragment)?.props?.level;
  return typeof level === "number" && level > 2 ? [`its first heading is level ${String(level)}. Start a template at level 2 (or 1 for a page's opening), so stacked sections never skip a level.`] : [];
}

/**
 * The shared e2e loop finds a button by its label and counts links and
 * buttons by theirs, both read from the fragment. So a button whose press
 * changes state has a label written in the template, and every link and
 * button label is one the fragment can be read for.
 */
function behaviorProblems(template: UiTemplate): string[] {
  const { buttons, unlabelled } = pressButtons(template);
  const start = (path: string): unknown => readPointer(template.fragment.state ?? {}, path);
  return [
    ...buttons
      .filter((button) => button.action === "toggleState" && typeof start(button.statePath) !== "boolean")
      .map((button) => `element "${button.key}" runs toggleState on "${button.statePath}", which does not start as true or false. Set it in the template's state, so a second press brings back exactly what the first changed.`),
    ...unlabelled.map((key) => `element "${key}" changes state when pressed, but its label is not written in the template. Give it a fixed label, so the e2e loop can press it.`),
    ...actionLabels(template).unread.map((key) => `element "${key}": its label cannot be read from the template (a $cond, say). Use fixed words, a repeat's item, state, or a $template.`),
  ];
}

const otherSide = { hideBelow: "hideAbove", hideAbove: "hideBelow" } as const;

/**
 * A Box that hides links or buttons below a width step is paired with one
 * that hides links or buttons above the same step, and the other way round.
 * Unpaired, or paired at another step, some width shows an action twice or
 * not at all. This checks the steps only; the e2e loop checks the labels a
 * reader meets (e2e/templates.spec.ts).
 */
function hideProblems(fragment: TemplateFragment): string[] {
  const hides = actionHides(fragment);
  return hides
    .filter((hide) => !hides.some((other) => other.side === otherSide[hide.side] && other.step === hide.step))
    .map((hide) => `element "${hide.key}" hides links or buttons with \`${hide.side}: "${hide.step}"\`, but no Box holds any with \`${otherSide[hide.side]}: "${hide.step}"\`. Pair the two at one step, so every action is drawn once at every width.`);
}

/** A Select with written options that keeps its choice in state: the path, and the words it can put there. */
function boundChoices(fragment: TemplateFragment): { key: string; path: string; options: string[] }[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    const { options, value } = element.props ?? {};
    if (element.type !== "Select" || !Array.isArray(options) || !isPlainObject(value) || typeof value.$bindState !== "string") return [];
    return [{ key, path: value.$bindState, options: options.filter((option): option is string => typeof option === "string") }];
  });
}

/** Every string a condition compares the state at `path` with (`{ "$state": path, "eq": "…" }`), anywhere in the fragment. */
function comparedWith(fragment: TemplateFragment, path: string): string[] {
  const found: string[] = [];
  walkJson(Object.values(fragment.elements), uiLimits.maxJsonDepth, ({ value }) => {
    if (isPlainObject(value) && value.$state === path && typeof value.eq === "string") found.push(value.eq);
  });
  return found;
}

/**
 * A Select's value is the chosen option's own words. So the value it starts
 * with, and every string a condition compares it with, must be one of its
 * options word for word, or the condition can never be true (or the start
 * shows no choice). An agent that rewords an option must reword these too.
 */
function choiceProblems(fragment: TemplateFragment): string[] {
  return boundChoices(fragment).flatMap(({ key, path, options }) => {
    const start = readPointer(fragment.state ?? {}, path);
    const starts = typeof start === "string" && start !== "" && !options.includes(start) ? [`element "${key}" starts at "${start}" (${path}), which is not one of its options.`] : [];
    const compared = comparedWith(fragment, path).filter((text) => !options.includes(text));
    return [...starts, ...[...new Set(compared)].map((text) => `a condition compares ${path} with "${text}", which is not one of the options of "${key}". A Select's value is its option's exact words.`)];
  });
}

function linkProblem(key: string, element: TemplateElement): string[] {
  const href = element.props?.href;
  if (href === undefined || (typeof href === "string" && exampleLink.test(href))) return [];
  return [`element "${key}": leave \`href\` out (a mockup link goes nowhere), or point it at https://example.com.`];
}

/** The `on` bindings of an element, as a flat list. */
function bindingsOf(element: TemplateElement): unknown[] {
  if (!isPlainObject(element.on)) return [];
  return Object.values(element.on).flatMap((binding): unknown[] => (Array.isArray(binding) ? binding : [binding]));
}

function actionProblem(key: string, element: TemplateElement): string[] {
  const unnamed = bindingsOf(element).some((binding) => isPlainObject(binding) && binding.action === "validateForm" && !(isPlainObject(binding.params) && typeof binding.params.statePath === "string"));
  return unnamed ? [`element "${key}": validateForm must name its \`statePath\`; its default path belongs to no template.`] : [];
}

function usesBareReference(element: TemplateElement): boolean {
  let found = false;
  walkJson([element.props, element.visible, element.on], uiLimits.maxJsonDepth, ({ key, value }) => {
    if (key === "$template" && typeof value === "string" && bareReference.test(value)) found = true;
  });
  return found;
}

/** Keys of the elements drawn once per item of a repeat: the children of an element with `repeat`, and everything under them. */
function repeatedKeys(fragment: TemplateFragment): Set<string> {
  const inside = new Set<string>();
  const stack = Object.values(fragment.elements).flatMap((element) => (element.repeat === undefined ? [] : element.children ?? []));
  for (let key = stack.pop(); key !== undefined; key = stack.pop()) {
    if (inside.has(key)) continue;
    inside.add(key);
    stack.push(...((Object.hasOwn(fragment.elements, key) ? fragment.elements[key] : undefined)?.children ?? []));
  }
  return inside;
}

function elementProblems(fragment: TemplateFragment): string[] {
  const repeated = repeatedKeys(fragment);
  return Object.entries(fragment.elements).flatMap(([key, element]) => [
    ...(uploadComponents.has(element.type) ? [`element "${key}": ${element.type} needs an upload. Use Placeholder.`] : []),
    ...linkProblem(key, element),
    ...actionProblem(key, element),
    ...(usesBareReference(element) && !repeated.has(key) ? [`element "${key}": a bare \${name} in $template reads a repeat's item. Outside a repeat, write \${/path}.`] : []),
  ]);
}

/** The first segment of an absolute path: the state key it starts at. */
function stateKeyOf(path: string): string {
  return path.split("/")[1] ?? "";
}

function stateProblems(fragment: TemplateFragment): string[] {
  const state = fragment.state ?? {};
  const problems: string[] = [];
  for (const [key, element] of Object.entries(fragment.elements)) {
    for (const path of elementStatePaths(element)) {
      if (!Object.hasOwn(state, stateKeyOf(path))) problems.push(`element "${key}" uses ${path}, which does not start at a key of the template's state. Give it a starting value in \`state\`.`);
    }
    const repeat = isPlainObject(element.repeat) ? element.repeat.statePath : undefined;
    if (element.repeat === undefined) continue;
    const items = typeof repeat === "string" ? readPointer(state, repeat) : undefined;
    if (!Array.isArray(items) || items.length === 0) problems.push(`element "${key}" repeats ${String(repeat)}, which is not a list with items in the template's state.`);
  }
  return problems;
}

function slotProblems(template: UiTemplate): string[] {
  const { fragment } = template;
  return template.slots.flatMap((slot) => {
    if (slot.what.trim() === "") return ["a slot has no `what`."];
    if ("state" in slot) return readPointer(fragment.state ?? {}, slot.state) === undefined ? [`slot "${slot.what}" points at ${slot.state}, which the template's state does not have.`] : [];
    const element = Object.hasOwn(fragment.elements, slot.element) ? fragment.elements[slot.element] : undefined;
    if (!element) return [`slot "${slot.what}" points at element "${slot.element}", which the template does not have.`];
    return element.props?.[slot.prop] === undefined ? [`slot "${slot.what}" points at ${slot.element}.${slot.prop}, which is not set.`] : [];
  });
}

/** Every validation issue of the template drawn as a whole spec: errors and warnings both count. */
function specProblems(template: UiTemplate): string[] {
  return validateUiSpec(templateAsSpec(template)).issues.map((issue) => `as a spec: ${issue.message}`);
}

/**
 * Everything wrong with a template, in words its author can act on. `file`
 * is the batch file it was found in. An empty list means the template keeps
 * every rule.
 */
export function templateProblems(template: UiTemplate, file: TemplateFile): string[] {
  const { fragment } = template;
  if (!Object.hasOwn(fragment.elements, fragment.root)) return [`root "${fragment.root}" is not one of its elements.`];
  const metadata = [...idProblems(template, file), ...wordProblems(template)];
  // The id is the prefix the spec is built with, so a template with a bad id cannot be drawn as one.
  if (!validId(template.id)) return metadata;
  return [
    ...metadata,
    ...keyProblems(fragment),
    ...rootProblems(template),
    ...budgetProblems(template),
    ...outlineProblems(fragment),
    ...behaviorProblems(template),
    ...hideProblems(fragment),
    ...choiceProblems(fragment),
    ...elementProblems(fragment),
    ...stateProblems(fragment),
    ...slotProblems(template),
    ...specProblems(template),
  ];
}
