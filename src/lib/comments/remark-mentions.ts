import { splitMentions, type MentionKind } from "./mentions";

/** The few markdown-tree fields this plugin reads and writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, string>; hChildren?: { type: "text"; value: string }[] };
}

/** Text under these nodes is never highlighted: links keep one target, and code is literal. */
const skipped = new Set(["link", "linkReference", "code", "inlineCode"]);

function mentionNode(value: string, handle: string, kind: MentionKind): MarkdownNode {
  return {
    type: "mention",
    value,
    data: { hName: "span", hProperties: { dataMention: kind, dataHandle: handle }, hChildren: [{ type: "text", value }] },
  };
}

/** Splits one text node into text and mention nodes. */
function splitTextNode(node: MarkdownNode, resolved: ReadonlyMap<string, MentionKind>): MarkdownNode[] {
  if (node.type !== "text" || !node.value) return [node];
  const segments = splitMentions(node.value, resolved);
  if (!segments.some((segment) => segment.type === "mention")) return [node];
  return segments.map((segment) => (segment.type === "text" ? { type: "text", value: segment.value } : mentionNode(segment.value, segment.handle, segment.kind)));
}

function visit(node: MarkdownNode, resolved: ReadonlyMap<string, MentionKind>) {
  if (!node.children || skipped.has(node.type)) return;
  node.children = node.children.flatMap((child) => splitTextNode(child, resolved));
  for (const child of node.children) visit(child, resolved);
}

/**
 * A remark plugin that marks resolved @handles in comment text as mention
 * nodes, rendered as `<span data-mention>`. Only slices of existing text nodes
 * move into these nodes, so no markup from the comment is ever interpreted.
 */
export function remarkMentions(resolved: ReadonlyMap<string, MentionKind>) {
  return () => (tree: MarkdownNode) => {
    if (resolved.size > 0) visit(tree, resolved);
  };
}
