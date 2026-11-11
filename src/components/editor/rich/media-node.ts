import { Node } from "@tiptap/core";

import { MEDIA_NODE, readMediaAttrs, renderMediaMarkdown, tokenizeMediaBlock, type MediaAttrs, type MediaToken } from "./media-markdown";

function dataAttrs(attrs: MediaAttrs): Record<string, string> {
  return {
    "data-media": attrs.kind,
    "data-src": attrs.src,
    "data-alt": attrs.alt,
    "data-caption": attrs.caption,
    ...(attrs.width === null ? {} : { "data-width": String(attrs.width) }),
  };
}

function attrsFromElement(element: HTMLElement): Partial<MediaAttrs> {
  const width = Number(element.getAttribute("data-width"));
  return readMediaAttrs({
    kind: element.getAttribute("data-media"),
    src: element.getAttribute("data-src"),
    alt: element.getAttribute("data-alt"),
    caption: element.getAttribute("data-caption"),
    width: Number.isFinite(width) && width > 0 ? width : null,
  });
}

function isMediaToken(token: unknown): token is MediaToken {
  return typeof token === "object" && token !== null && "attrs" in token && "type" in token && token.type === MEDIA_NODE;
}

/**
 * Images, video, audio, PDFs, and files in a document: one block node whose
 * whole state is plain attributes (see MediaAttrs), so it is safe for
 * real-time editing later. Its Markdown is image syntax alone in a
 * paragraph (media-markdown.ts); the editor draws it with MediaView.
 * Copying and pasting inside the editor keeps it through data attributes.
 */
export const MediaNode = Node.create({
  name: MEDIA_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: "" },
      kind: { default: "image" },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: null },
      uploadId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-media]", getAttrs: (element) => attrsFromElement(element) }];
  },

  renderHTML({ node }) {
    return ["figure", dataAttrs(readMediaAttrs(node.attrs))];
  },

  markdownTokenName: MEDIA_NODE,

  markdownTokenizer: {
    name: MEDIA_NODE,
    level: "block",
    // Never cut a paragraph short: a media block starts only where a block does.
    start: () => -1,
    tokenize: (src, _tokens, lexer) => tokenizeMediaBlock(src, (text) => lexer.inlineTokens(text)),
  },

  parseMarkdown: (token) => {
    if (!isMediaToken(token)) return [];
    return { type: MEDIA_NODE, attrs: { ...token.attrs } };
  },

  renderMarkdown: (node) => renderMediaMarkdown(readMediaAttrs(node.attrs)),
});
