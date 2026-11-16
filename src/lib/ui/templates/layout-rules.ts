import type { TemplateElement, TemplateFragment, UiTemplate } from "./types";

/**
 * The layout rules every template keeps, read from the spec alone. Each one
 * guards a layout fix that a later edit could undo without a test noticing
 * (the frame-width checks in e2e/templates-behavior.spec.ts measure the
 * same layouts in a browser). `templateProblems` in rules.ts adds them to
 * the rest.
 */

/**
 * Components that are always something a keyboard reaches: controls, and
 * boxes that become a tab stop (a table, chart, board, or diagram that
 * scrolls) or hold one (a code block's copy button, a calendar's days, a
 * download).
 */
const focusableTypes: ReadonlySet<string> = new Set([
  "Button", "Input", "Textarea", "Select", "Checkbox", "Switch", "Slider", "Checklist", "Tabs", "Accordion",
  "Calendar", "Board", "Table", "Chart", "Diagram", "Code", "Steps", "File",
]);

/** A Markdown link, an autolink, or a bare address: Markdown is focusable only when it holds one. */
const markdownLink = /\]\(|<(?:https?:|mailto:)|https?:\/\//;

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

const scrolls = (overflow: unknown) => overflow !== undefined && overflow !== "hidden" && overflow !== "visible";

/**
 * True when a keyboard can reach the element: a control or other always-focusable
 * kind, any element with an `on` binding, a Link with an `href` (one without is
 * plain words), a Box that scrolls, or Markdown that holds a link. An
 * expression for `href` or `overflow` is only known once it resolves, so it
 * counts.
 */
function isFocusable(element: TemplateElement): boolean {
  if (focusableTypes.has(element.type) || element.on !== undefined) return true;
  const props = element.props ?? {};
  if (element.type === "Link") return props.href !== undefined && props.href !== "";
  if (element.type === "Box") return scrolls(props.overflow);
  return element.type === "Markdown" && (typeof props.content !== "string" || markdownLink.test(props.content));
}

/** True when the element, or anything under it, can be focused. */
function holdsFocusable(fragment: TemplateFragment, key: string): boolean {
  const element = elementOf(fragment, key);
  if (element === undefined) return false;
  return isFocusable(element) || descendants(fragment, key).some((child) => {
    const inner = elementOf(fragment, child);
    return inner !== undefined && isFocusable(inner);
  });
}

/**
 * `reverseBelow` is visual only: keyboard and reading order stay as written.
 * It reorders the row's own children, so it changes the order of focusable
 * things only when two or more of those children each hold one (the keyboard
 * would meet them in the written order while the reader sees the opposite).
 * One child that holds controls keeps its place among the rest, and words and
 * pictures have no focus order at all (a feature row). Which children show is
 * decided at run time, so a child hidden by `visible` still counts.
 */
function reversedRowProblems(fragment: TemplateFragment): string[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    const reversed = element.props?.reverseBelow;
    if (reversed === undefined || reversed === false) return [];
    const holding = (element.children ?? []).filter((child) => holdsFocusable(fragment, child));
    if (holding.length < 2) return [];
    return [`element "${key}" draws its children in reverse below its stack width, and "${holding.join('", "')}" each hold something a reader can focus. \`reverseBelow\` is visual only, so the keyboard would reach them in the opposite order to the one drawn. Keep focusable things in one child of a reversed row.`];
  });
}

/** The one Button a Box holds as its only child, or undefined. */
function loneButton(fragment: TemplateFragment, box: TemplateElement | undefined): { key: string; button: TemplateElement } | undefined {
  const [only, ...rest] = box?.type === "Box" ? box.children ?? [] : [];
  const button = only === undefined || rest.length > 0 ? undefined : elementOf(fragment, only);
  return only !== undefined && button?.type === "Button" ? { key: only, button } : undefined;
}

/** The problems with one child of a stretching row: a button drawn directly in it, or alone in a Box that is not `fullWidth`. */
function stretchedChildProblems(fragment: TemplateFragment, row: string, child: string): string[] {
  const element = elementOf(fragment, child);
  if (element?.type === "Button") {
    return element.props?.fullWidth === true
      ? [`element "${child}" is a \`fullWidth\` button drawn directly in the row "${row}": as a row it takes the whole width and squeezes the words beside it. Put it alone in a Box, which sets the width the button fills.`]
      : [`element "${child}" is a button in the row "${row}", which stacks with \`alignBelow: "stretch"\`: a button keeps the width of its words, so it stays small at the start of the column. Put it alone in a Box (the Box stretches) and give the button \`fullWidth\`.`];
  }
  const lone = loneButton(fragment, element);
  if (lone === undefined || lone.button.props?.fullWidth === true) return [];
  return [`element "${lone.key}" sits alone in the Box "${child}" of the row "${row}", which stacks with \`alignBelow: "stretch"\`: the Box stretches but the button keeps the width of its words. Give the button "${lone.key}" \`fullWidth\`.`];
}

/**
 * A button is as wide as its words (`fullWidth` makes it fill its box), so a
 * row's `alignBelow: "stretch"` never widens a button that is its direct
 * child: the button stays small at the start of the stacked column, beside
 * full-width buttons elsewhere. The fix has two halves, and both are checked:
 * the button sits alone in a Box, which stretches, and the button is
 * `fullWidth`, which fills it (as a row the Box is as wide as the button). A
 * Box that holds several buttons is a row of actions, not a lone call to
 * action, and is left alone.
 */
function stackedButtonProblems(fragment: TemplateFragment): string[] {
  return Object.entries(fragment.elements).flatMap(([key, element]) => {
    const { direction, stackBelow, alignBelow } = element.props ?? {};
    if (element.type !== "Box" || direction !== "horizontal" || stackBelow === undefined || alignBelow !== "stretch") return [];
    return (element.children ?? []).flatMap((child) => stretchedChildProblems(fragment, key, child));
  });
}

/** Everything wrong with a template's layout, in words its author can act on. */
export function layoutProblems(template: UiTemplate): string[] {
  return [...browserFrameProblems(template), ...reversedRowProblems(template.fragment), ...stackedButtonProblems(template.fragment)];
}
