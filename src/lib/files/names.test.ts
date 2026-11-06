import { describe, expect, it } from "vitest";

import { contentDisposition, fileObjectKey, isFileObjectKey, sanitizeFilename } from "./names";

const id = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";

describe("sanitizeFilename", () => {
  it.each([
    ["report.pdf", "report.pdf"],
    ["Quarterly Report (final).PDF", "Quarterly-Report-final.pdf"],
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\me\\photo.png", "photo.png"],
    ["résumé.docx", "resume.docx"],
    [".env", "env"],
    ["...", "file"],
    ["", "file"],
    ["日本語.txt", "file.txt"],
    ["a\u0000b.png", "a-b.png"],
  ])("should turn %j into %j", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it("should keep the extension when the name is too long", () => {
    const name = sanitizeFilename(`${"a".repeat(300)}.json`);
    expect(name).toHaveLength(120);
    expect(name.endsWith(".json")).toBe(true);
  });
});

describe("fileObjectKey", () => {
  it("should build a key from the server id and the sanitized name", () => {
    expect(fileObjectKey(id, "My Photo.png")).toBe(`files/${id}/My-Photo.png`);
    expect(isFileObjectKey(fileObjectKey(id, "../../x"))).toBe(true);
  });

  it("should refuse an id that is not a uuid", () => {
    expect(() => fileObjectKey("../other", "a.png")).toThrow();
  });
});

describe("contentDisposition", () => {
  it("should say inline or attachment with both filename forms", () => {
    expect(contentDisposition("plan.pdf", true)).toBe(`inline; filename="plan.pdf"; filename*=UTF-8''plan.pdf`);
    expect(contentDisposition('evil".zip', false)).toBe(`attachment; filename="evil.zip"; filename*=UTF-8''evil.zip`);
  });
});
