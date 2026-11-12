import { Extension, Node, type AnyExtension, type JSONContent, type MarkdownToken } from "@tiptap/core";

import { blockColorAttributes, colorMarker, hasBlockColors, parseColorMarker, readBlockColors, readBlockHue, type BlockColors } from "@/lib/block-colors/block-color-rules";

/*
 * Block colors in the editor (markdown-dialect.md, "Block colors"). Paragraphs
 * and headings carry `color` and `background` attributes. In Markdown they
 * are a color comment at the end of the line's text, which a tokenizer here
 * reads into a marker that `liftBlockColors` moves onto the paragraph or
 * heading it ends. A marker left anywhere else is not in the schema, so that
 * block stays raw, as written.
 */

/** The node types that take colors. */
export const colorableNodes: ReadonlySet<string> = new Set(["paragraph", "heading"]);

/** The transient node a color comment parses to, before it is lifted onto its line. */
const MARKER = "blockColorMarker";

/** A color comment that ends an inline run (only whitespace after it). */
const trailingComment = /^<!--[\s\S]*?-->\s*$/;

/** The marked token for a color comment at the end of a line's text, if `src` starts with one. */
function tokenizeColorComment(src: string): MarkdownToken | undefined {
  const raw = trailingComment.exec(src)?.[0];
  if (raw === undefined) return undefined;
  const colors = parseColorMarker(raw);
  return colors ? { type: MARKER, raw, colors } : undefined;
}

/** Reads color comments at the end of a paragraph's or heading's text. */
export const BlockColorComment = Extension.create({
  name: MARKER,
  markdownTokenName: MARKER,
  markdownTokenizer: {
    name: MARKER,
    level: "inline",
    start: (src) => src.indexOf("<!--"),
    tokenize: (src) => tokenizeColorComment(src),
  },
  parseMarkdown: (token) => ({ type: MARKER, attrs: readBlockColors(token.colors as Record<string, unknown> | undefined) }),
});

/** Moves a trailing marker's colors onto `node`; returns the node unchanged when it has none. */
function liftOne(node: JSONContent): JSONContent {
  const content = node.content ?? [];
  const last = content.at(-1);
  if (!colorableNodes.has(node.type ?? "") || last?.type !== MARKER) return node;
  const kept = content.slice(0, -1);
  const before = kept.at(-1);
  if (before?.type === "text") {
    const text = (before.text ?? "").trimEnd();
    if (text) kept[kept.length - 1] = { ...before, text };
    else kept.pop();
  }
  const colors = readBlockColors(last.attrs);
  return { ...node, attrs: { ...node.attrs, ...colors }, content: kept };
}

/**
 * Parsed nodes with each color marker lifted onto the paragraph or heading
 * whose text it ends. Markers anywhere else stay, and the schema then
 * rejects the block, so it is kept as written.
 */
export function liftBlockColors(nodes: readonly JSONContent[]): JSONContent[] {
  return nodes.map((node) => {
    const lifted = node.content ? { ...node, content: liftBlockColors(node.content) } : node;
    return liftOne(lifted);
  });
}

/** `markdown` with the node's color comment after it, when it has colors and text. */
function withColorComment(markdown: string, colors: BlockColors): string {
  if (!hasBlockColors(colors) || !markdown.trim()) return markdown;
  return `${markdown} ${colorMarker(colors)}`;
}

const colorAttributes = {
  color: {
    default: null,
    parseHTML: (element: HTMLElement) => readBlockHue(element.getAttribute("data-block-color")),
    renderHTML: (attrs: Record<string, unknown>) => blockColorAttributes({ color: readBlockHue(attrs.color), background: null }),
  },
  background: {
    default: null,
    parseHTML: (element: HTMLElement) => readBlockHue(element.getAttribute("data-block-background")),
    renderHTML: (attrs: Record<string, unknown>) => blockColorAttributes({ color: null, background: readBlockHue(attrs.background) }),
  },
};

/** A paragraph or heading node that keeps colors and writes them as a color comment. */
function colored(node: Node): Node {
  return node.extend({
    addAttributes() {
      return { ...this.parent?.(), ...colorAttributes };
    },
    renderMarkdown(json, helpers, context) {
      const markdown = this.parent?.(json, helpers, context) ?? "";
      return withColorComment(markdown, readBlockColors(json.attrs));
    },
  });
}

/** StarterKit's own extensions, with its paragraph and heading taking colors. */
export function withColorableText(extensions: readonly AnyExtension[]): AnyExtension[] {
  return extensions.map((extension) => (extension instanceof Node && colorableNodes.has(extension.name) ? colored(extension) : extension));
}
