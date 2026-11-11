import { fenceInfoOfLine } from "./fence-info";

/** The few markdown-tree fields this plugin reads and writes. */
interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number | undefined } } | undefined;
  data?: { hProperties?: Record<string, unknown> };
}

/** The source file remark hands a plugin; only its text is read. */
interface SourceFile {
  value: unknown;
}

/** The fence line of a code node, read from the source at the node's start. */
function fenceLineOf(source: string, node: MarkdownNode): string | null {
  const start = node.position?.start.offset;
  if (typeof start !== "number") return null;
  const end = source.indexOf("\n", start);
  return source.slice(start, end < 0 ? undefined : end);
}

function visit(node: MarkdownNode, source: string) {
  if (node.type === "code") {
    const line = fenceLineOf(source, node);
    const info = line === null ? null : fenceInfoOfLine(line);
    if (info) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataFenceInfo: info } };
    return;
  }
  for (const child of node.children ?? []) visit(child, source);
}

/**
 * A remark plugin that puts each fenced code block's info string, exactly
 * as written on its fence line, on the rendered `<code>` as
 * `data-fence-info`. Remark decodes backslash escapes in `lang` and `meta`,
 * which would lose a caption's escaped quotes (fence-info.ts). Only text is
 * copied into an attribute, so nothing in it is ever interpreted as markup.
 */
export function remarkFenceInfo() {
  return (tree: MarkdownNode, file: SourceFile) => {
    if (typeof file.value === "string") visit(tree, file.value);
  };
}
