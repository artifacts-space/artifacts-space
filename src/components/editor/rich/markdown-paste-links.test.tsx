import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "@/components/artifact-view/markdown-view";
import { artifactShowsLink, commentShowsLink } from "@/lib/markdown/link-href";

import { richEditorExtensions } from "./editor-extensions";
import { withoutRefusedLinks, type PastedLinkRule } from "./markdown-paste";
import { parseMarkdownFragment } from "./markdown-roundtrip";

const upload = "/api/files/0b5c8f9e-3c1d-4a8e-9f7b-2d6e1a4c5b3f";

/** Addresses a pasted link may carry: ones the renderer links and ones it refuses. */
const addresses = [
  upload,
  `${upload}?download=1`,
  "#anchor",
  "/relative/page",
  "mailto:dana@example.com",
  "https://example.com/notes",
  "http://example.com",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html,hi",
  "vbscript:msgbox",
  "ftp://example.com/file",
];

/** True when the pasted link is still a link in the box. */
function pastedAsLink(href: string, keepsLink: PastedLinkRule): boolean {
  const nodes = withoutRefusedLinks(parseMarkdownFragment(`Read [the words](${href}) now`), keepsLink);
  return JSON.stringify(nodes).includes('"type":"link"');
}

/** True when the renderer shows the link: as an artifact's Markdown (uploads on) or as a comment. */
function rendersAsLink(href: string, surface: "artifact" | "comment"): boolean {
  const html = renderToStaticMarkup(<MarkdownView content={`Read [the words](${href}) now`} media={surface === "artifact"} />);
  return /<a [^>]*href="[^"]+"/.test(html);
}

describe("links in pasted Markdown", () => {
  it.each(addresses)("should keep %s a link in an artifact exactly when the artifact renders it as one", (href) => {
    expect(pastedAsLink(href, artifactShowsLink)).toBe(rendersAsLink(href, "artifact"));
  });

  it.each(addresses)("should keep %s a link in a comment exactly when the comment renders it as one", (href) => {
    expect(pastedAsLink(href, commentShowsLink)).toBe(rendersAsLink(href, "comment"));
  });

  it("should keep an upload link when it is pasted into an artifact", () => {
    expect(pastedAsLink(upload, artifactShowsLink)).toBe(true);
    expect(pastedAsLink(`${upload}?download=1`, artifactShowsLink)).toBe(true);
  });

  it("should paste an upload link as words in a comment, which never links uploads", () => {
    expect(pastedAsLink(upload, commentShowsLink)).toBe(false);
  });

  it("should paste an unsafe link as its words, keeping the rest of the formatting, when it is refused", () => {
    for (const keepsLink of [artifactShowsLink, commentShowsLink]) {
      const nodes = JSON.stringify(withoutRefusedLinks(parseMarkdownFragment("Run [this](javascript:alert(1)) **now**"), keepsLink));
      expect(nodes).not.toContain("javascript");
      expect(nodes).toContain('"text":"this"');
      expect(nodes).toContain('"type":"bold"');
    }
  });

  it("should paste with the artifact's rule in an artifact editor and the comment's in the comment box", () => {
    const pasteRule = (extensions: ReturnType<typeof richEditorExtensions>): unknown => extensions.find((extension) => extension.name === "markdownPaste")?.options;
    expect(pasteRule(richEditorExtensions({ onLinkShortcut: () => false }))).toEqual({ keepsLink: artifactShowsLink });
    expect(pasteRule(richEditorExtensions({ onLinkShortcut: () => false, media: false, boxPlaceholder: "Write a comment", pastedLinks: commentShowsLink }))).toEqual({ keepsLink: commentShowsLink });
  });
});
