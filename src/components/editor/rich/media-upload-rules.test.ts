import { describe, expect, it } from "vitest";

import { defaultMediaLabel, fetchableUrl, filenameFromUrl, insertableFiles, maxFilesPerInsert, mediaUploadProblem, pasteIsFiles, uploadMediaKind } from "./media-upload-rules";

function file(name: string, type: string, size = 10) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("mediaUploadProblem", () => {
  it("should allow a file type the store takes when it is within the size cap", () => {
    expect(mediaUploadProblem({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
  });

  it("should explain the refusal when the type is not allowed or the file is too big", () => {
    expect(mediaUploadProblem({ name: "a.svg", type: "image/svg+xml", size: 10 })).toMatch(/not supported/);
    expect(mediaUploadProblem({ name: "a.mp4", type: "video/mp4", size: 30 * 1024 * 1024 })).toMatch(/The limit is 25 MB/);
  });
});

describe("uploadMediaKind", () => {
  it.each([
    ["shot.png", "image/png", "image"],
    ["demo.mp4", "video/mp4", "video"],
    ["call.mp3", "", "audio"],
    ["report.pdf", "application/octet-stream", "pdf"],
    ["data.csv", "text/csv", "file"],
    ["thing.exe", "application/x-msdownload", "file"],
  ])("should show %s as %s", (name, type, kind) => {
    expect(uploadMediaKind({ name, type })).toBe(kind);
  });
});

describe("defaultMediaLabel", () => {
  it("should leave alt text empty for images and video and name the file for the rest", () => {
    expect(defaultMediaLabel("image", "IMG_2041.jpg")).toBe("");
    expect(defaultMediaLabel("video", "demo.mp4")).toBe("");
    expect(defaultMediaLabel("pdf", "q3.pdf")).toBe("q3.pdf");
  });
});

describe("insertableFiles", () => {
  it("should skip empty files and cap how many one drop adds", () => {
    const many = Array.from({ length: maxFilesPerInsert + 3 }, (_, index) => file(`${String(index)}.png`, "image/png"));
    expect(insertableFiles([file("empty.png", "image/png", 0), ...many])).toHaveLength(maxFilesPerInsert);
  });
});

describe("filenameFromUrl", () => {
  it("should take the last part of the path when a link names a file", () => {
    expect(filenameFromUrl("https://example.com/img/Team%20photo.jpg?w=200")).toBe("Team photo.jpg");
  });

  it("should fall back to image when the link has no file name", () => {
    expect(filenameFromUrl("https://example.com/")).toBe("image");
    expect(filenameFromUrl("not a url")).toBe("image");
  });
});

describe("fetchableUrl", () => {
  it("should accept web links and refuse every other scheme", () => {
    expect(fetchableUrl(" https://example.com/a.png ")).toBe("https://example.com/a.png");
    expect(fetchableUrl("mailto:a@example.com")).toBeNull();
    expect(fetchableUrl("javascript:alert(1)")).toBeNull();
    expect(fetchableUrl("/api/files/x")).toBeNull();
  });
});

describe("pasteIsFiles", () => {
  it("should upload a copied image or screenshot", () => {
    expect(pasteIsFiles({ fileNames: ["image.png"], text: "", html: "" })).toBe(true);
    expect(pasteIsFiles({ fileNames: ["image.png"], text: "", html: '<meta charset="utf-8"><img src="https://example.com/a.png" alt="">' })).toBe(true);
  });

  it("should upload files copied in a file manager, which send their names as text", () => {
    expect(pasteIsFiles({ fileNames: ["a.pdf", "b.png"], text: "a.pdf\nb.png", html: "" })).toBe(true);
  });

  it("should paste the text when a spreadsheet or document sends a picture along with it", () => {
    expect(pasteIsFiles({ fileNames: ["image.png"], text: "Q3\t12", html: "<table><tr><td>Q3</td></tr></table>" })).toBe(false);
    expect(pasteIsFiles({ fileNames: ["image.png"], text: "", html: "<p>Heading</p><img src=x>" })).toBe(false);
  });

  it("should do nothing when the paste holds no files", () => {
    expect(pasteIsFiles({ fileNames: [], text: "", html: "" })).toBe(false);
  });
});
