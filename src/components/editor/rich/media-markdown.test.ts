import { describe, expect, it } from "vitest";

import { emptyMediaAttrs, escapeMediaAlt, mediaAttrsFromImage, mediaFileId, readMediaAttrs, renderMediaMarkdown } from "./media-markdown";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const src = `/api/files/${id}`;

function onlyMedia(markdown: string) {
  const [node] = parseMarkdown(markdown).doc.content ?? [];
  return node;
}

describe("renderMediaMarkdown", () => {
  it("should write image syntax with the caption as its title when an upload has a caption", () => {
    expect(renderMediaMarkdown({ ...emptyMediaAttrs(), src, alt: "Q3 chart", caption: "Revenue grew" })).toBe(`![Q3 chart](${src} "Revenue grew")`);
  });

  it("should put the kind and width in the URL fragment when they are set", () => {
    expect(renderMediaMarkdown({ ...emptyMediaAttrs("video"), src, alt: "Demo", width: 75 })).toBe(`![Demo](${src}#video&width=75)`);
  });

  it("should write nothing when the block is empty or still uploading", () => {
    expect(renderMediaMarkdown(emptyMediaAttrs())).toBe("");
    expect(renderMediaMarkdown({ ...emptyMediaAttrs(), uploadId: "upload-1" })).toBe("");
  });

  it("should write nothing when the source is a scheme the link policy refuses", () => {
    expect(renderMediaMarkdown({ ...emptyMediaAttrs(), src: "javascript:alert(1)" })).toBe("");
  });

  it("should escape Markdown in alt text and quotes in captions so they read back the same", () => {
    const attrs = { ...emptyMediaAttrs(), src, alt: "A [b] *c* <d> & e", caption: 'Say "hi" \\ there' };
    const markdown = renderMediaMarkdown(attrs);
    expect(markdown).toBe(`![${escapeMediaAlt(attrs.alt)}](${src} "Say \\"hi\\" \\\\ there")`);
    expect(onlyMedia(`${markdown}\n`)?.attrs).toMatchObject({ alt: attrs.alt, caption: attrs.caption });
  });

  it("should keep alt text and captions on one line when they were typed with line breaks", () => {
    expect(renderMediaMarkdown({ ...emptyMediaAttrs(), src, alt: "two\nlines", caption: "a\n\nb" })).toBe(`![two lines](${src} "a b")`);
  });
});

describe("mediaAttrsFromImage", () => {
  it("should keep an external http image as an image block that never loads", () => {
    expect(mediaAttrsFromImage("https://example.com/a.png", null, "A")).toMatchObject({ src: "https://example.com/a.png", kind: "image" });
  });

  it("should refuse a source that is neither an upload nor a web image", () => {
    expect(mediaAttrsFromImage("./a.png", null, "A")).toBeNull();
    expect(mediaAttrsFromImage("mailto:team@example.com", null, "A")).toBeNull();
    expect(mediaAttrsFromImage("data:image/png;base64,AAAA", null, "A")).toBeNull();
  });
});

describe("readMediaAttrs", () => {
  it("should fall back to safe values when a node arrives with unexpected attributes", () => {
    expect(readMediaAttrs({ src: 4, kind: "embed", alt: null, width: 7, uploadId: "" })).toEqual(emptyMediaAttrs());
  });

  it("should give the file id only for uploads", () => {
    expect(mediaFileId({ src })).toBe(id);
    expect(mediaFileId({ src: "https://example.com/a.png" })).toBeNull();
  });
});

describe("media blocks in the round trip", () => {
  it("should write the new width and keep the other blocks as written when a media block is resized", () => {
    const markdown = `* Notes\n\n![Chart](/api/files/${id.toUpperCase()} 'Old')\n\n| a |\n|---|\n| 1 |\n`;
    const loaded = parseMarkdown(markdown);
    const content = (loaded.doc.content ?? []).map((node) => (node.type === "media" ? { ...node, attrs: { ...node.attrs, width: 50 } } : node));
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe(`* Notes\n\n![Chart](/api/files/${id}#width=50 "Old")\n\n| a |\n|---|\n| 1 |\n`);
  });

  it("should leave an uploading block out of the saved Markdown", () => {
    const loaded = parseMarkdown("Intro\n");
    const content = [...(loaded.doc.content ?? []), { type: "media", attrs: { ...emptyMediaAttrs(), uploadId: "u1" } }, { type: "paragraph", content: [{ type: "text", text: "After" }] }];
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe("Intro\n\nAfter\n");
  });

  it("should write an uploaded file once it arrives", () => {
    const loaded = parseMarkdown("Intro\n");
    const content = [...(loaded.doc.content ?? []), { type: "media", attrs: { ...emptyMediaAttrs("pdf"), src, alt: "Report" } }];
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe(`Intro\n\n![Report](${src}#pdf)\n`);
  });

  it("should keep an image with a character reference in its alt text as written", () => {
    expect(onlyMedia(`![Tom &amp; Jerry](${src})\n`)?.type).toBe("rawMarkdown");
  });
});
