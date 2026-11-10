import { Node } from "@tiptap/core";

/** The node name for Markdown the editor keeps exactly as written. */
export const RAW_MARKDOWN = "rawMarkdown";

/**
 * A block of Markdown the editor cannot show as formatted text, such as raw
 * HTML, footnotes, images inside text, or link definitions. It holds the source exactly
 * as written and writes it back unchanged, so nothing is lost on save. The
 * editor shows it as an editable source box (see `raw-block-view.tsx`).
 */
export const RawMarkdown = Node.create({
  name: RAW_MARKDOWN,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-raw-markdown]", getAttrs: (element) => ({ source: element.textContent }) }];
  },

  renderHTML({ node }) {
    const source = typeof node.attrs.source === "string" ? node.attrs.source : "";
    return ["pre", { "data-raw-markdown": "" }, source];
  },

  renderMarkdown: (node) => {
    const source: unknown = node.attrs?.source;
    return typeof source === "string" ? source : "";
  },
});
