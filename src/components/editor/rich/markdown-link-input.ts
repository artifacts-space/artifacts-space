import { Extension, InputRule } from "@tiptap/core";

import { isAllowedEditorUri } from "./markdown-schema";

/** `[words](address)` just typed, not an image (`![`). */
const TYPED_LINK = /(^|[^!\\])\[([^\]\n]+)\]\(([^()\s]+)\)$/;

/**
 * Typing a Markdown link, `[docs](https://example.com)`, makes it a link as
 * the closing parenthesis goes in, for screens with no menu over a
 * selection. Addresses go through the same policy as every link (http,
 * https, and mailto); any other stays as the typed text.
 */
export const MarkdownLinkInput = Extension.create({
  name: "markdownLinkInput",

  addInputRules() {
    return [
      new InputRule({
        find: TYPED_LINK,
        handler: ({ state, range, match }) => {
          const [, before = "", label = "", href = ""] = match;
          const link = state.schema.marks.link;
          if (!link || !label || !isAllowedEditorUri(href)) return null;
          const from = range.from + before.length;
          state.tr.replaceWith(from, range.to, state.schema.text(label, [link.create({ href })])).removeStoredMark(link);
          return undefined;
        },
      }),
    ];
  },
});
