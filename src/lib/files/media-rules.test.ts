import { describe, expect, it } from "vitest";

import { absoluteFileLinks, clampMediaWidth, fileMediaUrl, hasAdjustableWidth, isFileLinkPath, isFileMediaUrl, markdownFileRefs, mediaKindForType, parseFileMediaUrl } from "./media-rules";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("parseFileMediaUrl", () => {
  it("should read an image with no options when the URL is the bare file path", () => {
    expect(parseFileMediaUrl(`/api/files/${id}`)).toEqual({ fileId: id, kind: "image", width: null });
  });

  it("should read the kind and width when the fragment names both, in either order", () => {
    expect(parseFileMediaUrl(`/api/files/${id}#video&width=60`)).toEqual({ fileId: id, kind: "video", width: 60 });
    expect(parseFileMediaUrl(`/api/files/${id}#width=60&video`)).toEqual({ fileId: id, kind: "video", width: 60 });
  });

  it("should lowercase the file id when the URL uses capitals", () => {
    expect(parseFileMediaUrl(`/api/files/${id.toUpperCase()}#pdf`)?.fileId).toBe(id);
  });

  it.each([
    ["another path", `/api/other/${id}`],
    ["a query string", `/api/files/${id}?download=1`],
    ["an unknown option", `/api/files/${id}#poster`],
    ["a repeated kind", `/api/files/${id}#video&audio`],
    ["a width under the range", `/api/files/${id}#width=5`],
    ["a width over the range", `/api/files/${id}#width=101`],
    ["a fractional width", `/api/files/${id}#width=50.5`],
    ["an empty fragment", `/api/files/${id}#`],
    ["an absolute URL", `https://artifacts.space/api/files/${id}`],
    ["a short id", "/api/files/1234"],
  ])("should refuse the URL when it has %s", (_name, url) => {
    expect(parseFileMediaUrl(url)).toBeNull();
    expect(isFileMediaUrl(url)).toBe(false);
  });
});

describe("fileMediaUrl", () => {
  it("should leave the kind out when the media is an image", () => {
    expect(fileMediaUrl({ fileId: id, kind: "image", width: null })).toBe(`/api/files/${id}`);
    expect(fileMediaUrl({ fileId: id, kind: "image", width: 40 })).toBe(`/api/files/${id}#width=40`);
  });

  it("should write the kind before the width when both are set", () => {
    expect(fileMediaUrl({ fileId: id, kind: "video", width: 80 })).toBe(`/api/files/${id}#video&width=80`);
  });

  it.each(["image", "video", "audio", "pdf", "file"] as const)("should read back what it writes when the kind is %s", (kind) => {
    const target = { fileId: id, kind, width: kind === "image" ? 25 : null };
    expect(parseFileMediaUrl(fileMediaUrl(target))).toEqual(target);
  });
});

describe("isFileLinkPath", () => {
  it("should accept file links and downloads when they point at an upload", () => {
    expect(isFileLinkPath(`/api/files/${id}`)).toBe(true);
    expect(isFileLinkPath(`/api/files/${id}?download=1`)).toBe(true);
    expect(isFileLinkPath(`/api/files/${id}#pdf`)).toBe(true);
  });

  it("should refuse other paths and query strings when a link is not a plain file link", () => {
    expect(isFileLinkPath(`/api/files/${id}?x=1`)).toBe(false);
    expect(isFileLinkPath(`/api/files/${id}/../../mcp`)).toBe(false);
    expect(isFileLinkPath("/app")).toBe(false);
    expect(isFileLinkPath(`//evil.example/api/files/${id}`)).toBe(false);
  });
});

describe("markdownFileRefs", () => {
  it("should list every file once when a document embeds and links files", () => {
    const markdown = `![a](/api/files/${id})\n\n[deck](/api/files/${other}?download=1) and ![b](/api/files/${id.toUpperCase()}#width=20)`;
    expect(markdownFileRefs(markdown)).toEqual([id, other]);
  });

  it("should find nothing when the document names no uploaded file", () => {
    expect(markdownFileRefs("![x](https://example.com/a.png) /api/files/nope")).toEqual([]);
  });
});

describe("mediaKindForType", () => {
  it.each([
    ["image/png", "image"],
    ["video/mp4", "video"],
    ["audio/mpeg", "audio"],
    ["application/pdf", "pdf"],
    ["text/csv", "file"],
    ["text/plain", "file"],
    ["application/x-unknown", "file"],
  ])("should show %s as %s", (type, kind) => {
    expect(mediaKindForType(type)).toBe(kind);
  });
});

describe("clampMediaWidth", () => {
  it("should keep a dragged width a whole percent inside the range", () => {
    expect(clampMediaWidth(47.6)).toBe(48);
    expect(clampMediaWidth(2)).toBe(10);
    expect(clampMediaWidth(140)).toBe(100);
    expect(clampMediaWidth(Number.NaN)).toBe(100);
  });
});

describe("hasAdjustableWidth", () => {
  it("should let images and videos be resized but not players or file cards", () => {
    expect(["image", "video", "audio", "pdf", "file"].filter((kind) => hasAdjustableWidth(kind as never))).toEqual(["image", "video"]);
  });
});

describe("absoluteFileLinks", () => {
  it("should point file links at the site when the Markdown is read outside it", () => {
    const markdown = `![a](/api/files/${id}#width=50 "c") and [b](</api/files/${other}>) and \`/api/files/${id}\``;
    expect(absoluteFileLinks(markdown, "https://artifacts.space/")).toBe(
      `![a](https://artifacts.space/api/files/${id}#width=50 "c") and [b](<https://artifacts.space/api/files/${other}>) and \`/api/files/${id}\``,
    );
  });
});
