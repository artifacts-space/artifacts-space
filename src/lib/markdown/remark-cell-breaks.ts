import { isLineBreakTag } from "./cell-breaks";

/** The few markdown-tree fields this plugin reads and writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

/** A cell's content with every `<br>` tag, at any depth, as a line break. */
function withBreaks(node: MarkdownNode): void {
  const children = node.children ?? [];
  for (const [index, child] of children.entries()) {
    if (child.type === "html" && isLineBreakTag(child.value ?? "")) children[index] = { type: "break" };
    else withBreaks(child);
  }
}

function visit(node: MarkdownNode): void {
  if (node.type === "tableCell") {
    withBreaks(node);
    return;
  }
  for (const child of node.children ?? []) visit(child);
}

/**
 * A remark plugin that reads `<br>` in a table cell as a line break, as
 * GitHub does (cell-breaks.ts). The read view skips raw HTML, so without it
 * a cell the editor wrote as `one<br>two` read "onetwo". Only the tag
 * itself becomes a break node; no other HTML is let through.
 */
export function remarkCellBreaks() {
  return (tree: MarkdownNode) => {
    visit(tree);
  };
}
