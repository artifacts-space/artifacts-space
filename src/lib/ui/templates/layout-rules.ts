import type { TemplateElement, TemplateFragment, UiTemplate } from "./types";

/**
 * The layout rules every template keeps, read from the spec alone. Each one
 * guards a layout fix that a later edit could undo without a test noticing
 * (the frame-width checks in e2e/templates-behavior.spec.ts measure the
 * same layouts in a browser). `templateProblems` in rules.ts adds them to
 * the rest.
 */

/** Components a reader presses, types into, or opens. Drawing them in another order than they are written breaks keyboard order. */
const interactiveTypes: ReadonlySet<string> = new Set(["Button", "Link", "Input", "Textarea", "Select", "Checkbox", "Switch", "Slider", "Tabs", "Accordion"]);

const elementOf = (fragment: TemplateFragment, key: string): TemplateElement | undefined => (Object.hasOwn(fragment.elements, key) ? fragment.elements[key] : undefined);

/** A browser frame draws an example address, and a slot names it, so an agent rewrites the address with the rest of the words. */
function browserFrameProblems({ fragment, slots }: UiTemplate): string[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    if (element.type !== "Placeholder" || element.props?.frame !== "browser") return [];
    const address = element.props.address;
    const problems: string[] = [];
    if (typeof address !== "string" || address.trim() === "") problems.push(`element "${key}" draws a browser frame with no \`address\`. Write an example address on https://example.com, so the window's bar is not empty.`);
    if (!slots.some((slot) => "element" in slot && slot.element === key && slot.prop === "address")) problems.push(`element "${key}" draws a browser frame, but no slot names its \`address\`.`);
    return problems;
  });
}

/** Every element below `key`, found through `children`. */
function descendants(fragment: TemplateFragment, key: string): string[] {
  const seen = new Set<string>();
  const stack = [...(elementOf(fragment, key)?.children ?? [])];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(elementOf(fragment, next)?.children ?? []));
  }
  return [...seen];
}

const isInteractive = (element: TemplateElement) => interactiveTypes.has(element.type) || element.on !== undefined;

/**
 * `reverseBelow` is visual only: keyboard and reading order stay as written.
 * That is safe when the reversed children hold words and pictures (a row of
 * a feature section), and wrong when one holds a control, which the keyboard
 * would reach in the opposite order to the one drawn.
 */
function reversedRowProblems(fragment: TemplateFragment): string[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    const reversed = element.props?.reverseBelow;
    if (reversed === undefined || reversed === false) return [];
    const controls = descendants(fragment, key).filter((child) => {
      const inner = elementOf(fragment, child);
      return inner !== undefined && isInteractive(inner);
    });
    return controls.length === 0 ? [] : [`element "${key}" draws its children in reverse below its stack width, but "${controls.join('", "')}" can be pressed or typed into. \`reverseBelow\` is visual only, so keyboard order would run against what is drawn. Keep controls out of a reversed row.`];
  });
}

/**
 * A button is as wide as its words (`fullWidth` makes it fill its box), so a
 * row's `alignBelow: "stretch"` never widens a button that is its direct
 * child: the button stays small at the start of the stacked column, beside
 * full-width buttons elsewhere. Wrap the button in a Box, which stretches,
 * and make the button `fullWidth` (in a row the Box is as wide as the button).
 */
function stackedButtonProblems(fragment: TemplateFragment): string[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    const { direction, stackBelow, alignBelow } = element.props ?? {};
    if (element.type !== "Box" || direction !== "horizontal" || stackBelow === undefined || alignBelow !== "stretch") return [];
    const small = (element.children ?? []).filter((child) => {
      const inner = elementOf(fragment, child);
      return inner?.type === "Button" && inner.props?.fullWidth !== true;
    });
    return small.map((child) => `element "${child}" is a button in the row "${key}", which stacks with \`alignBelow: "stretch"\`: a button keeps the width of its words, so it stays small at the start of the column. Put it in a Box and give it \`fullWidth\`.`);
  });
}

/** Everything wrong with a template's layout, in words its author can act on. */
export function layoutProblems(template: UiTemplate): string[] {
  return [...browserFrameProblems(template), ...reversedRowProblems(template.fragment), ...stackedButtonProblems(template.fragment)];
}
