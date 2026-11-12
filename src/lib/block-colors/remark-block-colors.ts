import { hasBlockColors, parseColorMarker, type BlockColors } from "./block-color-rules";

/** The few Markdown-tree fields this plugin reads and writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  spread?: boolean | null;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

/** Node types whose own text a color comment colors. */
const colorable: ReadonlySet<string> = new Set(["paragraph", "heading"]);

/** Takes trailing whitespace off the text before a removed comment, and the text node when nothing is left. */
function trimTrailingText(children: MarkdownNode[]) {
  const before = children.at(-1);
  if (before?.type !== "text") return;
  before.value = (before.value ?? "").trimEnd();
  if (!before.value) children.pop();
}

/** The colors from a color comment ending `node`'s text, with the comment taken out; null when there is none. */
function takeColors(node: MarkdownNode): BlockColors | null {
  const children = node.children ?? [];
  const last = children.at(-1);
  if (!colorable.has(node.type) || last?.type !== "html") return null;
  const colors = parseColorMarker(last.value ?? "");
  if (!colors) return null;
  children.pop();
  trimTrailingText(children);
  return colors;
}

/** The colors as hast properties, which turn into `data-block-color` and `data-block-background`. */
function hastColorProperties(colors: BlockColors): Record<string, string> {
  const properties: Record<string, string> = {};
  if (colors.color) properties.dataBlockColor = colors.color;
  if (colors.background) properties.dataBlockBackground = colors.background;
  return properties;
}

/** True when the list renders its items' first paragraphs without a `<p>` (a tight list). */
function isTight(list: MarkdownNode): boolean {
  return list.spread !== true && !(list.children ?? []).some((item) => item.spread === true);
}

/**
 * Puts the colors on the element: the paragraph or heading itself, or, for
 * the first line of an item in a tight list (drawn without a `<p>`), a span
 * around its text.
 */
function applyColors(node: MarkdownNode, colors: BlockColors, wrapText: boolean) {
  if (!hasBlockColors(colors)) return;
  const properties = hastColorProperties(colors);
  if (!wrapText) {
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...properties } };
    return;
  }
  node.children = [{ type: "blockColor", children: node.children ?? [], data: { hName: "span", hProperties: properties } }];
}

/**
 * Colors `node` and everything under it. `tight` says, for a list item,
 * that its list is tight; for any other node, that it is the first line of
 * an item in a tight list.
 */
function visit(node: MarkdownNode, tight: boolean) {
  const colors = takeColors(node);
  if (colors) applyColors(node, colors, tight);
  const tightList = node.type === "list" && isTight(node);
  for (const [index, child] of (node.children ?? []).entries()) {
    if (child.type === "listItem") visit(child, tightList);
    else visit(child, node.type === "listItem" && tight && index === 0);
  }
}

/**
 * A remark plugin for block colors (markdown-dialect.md, "Block colors"): a
 * color comment at the end of a paragraph's or heading's text becomes
 * `data-block-color` and `data-block-background` on it, and the comment goes.
 * Other comments stay raw HTML, which the read view skips.
 */
export function remarkBlockColors() {
  return (tree: MarkdownNode) => {
    visit(tree, false);
  };
}
