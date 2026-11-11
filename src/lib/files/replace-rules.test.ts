import { describe, expect, it } from "vitest";

import { copyCurrentAt, offersReplace, replacedSince, replacementFilename, replaceTargetProblem } from "./replace-rules";

const pdf = "application/pdf";
const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const minute = (value: number) => new Date(Date.UTC(2026, 10, 10, 12, value));

describe("replacementFilename", () => {
  it("should keep the file's own name when the new file has the same type", () => {
    expect(replacementFilename({ filename: "SOW.pdf", contentType: pdf }, { filename: "draft (3).pdf", contentType: pdf })).toBe("SOW.pdf");
  });

  it("should keep the name with the new extension when the type changes", () => {
    expect(replacementFilename({ filename: "SOW.docx", contentType: docx }, { filename: "draft (3).pdf", contentType: pdf })).toBe("SOW.pdf");
  });

  it("should use the type's own extension when the new file's name has another one", () => {
    expect(replacementFilename({ filename: "deck.pdf", contentType: pdf }, { filename: "export.bin", contentType: "image/png" })).toBe("deck.png");
  });

  it("should keep a spelled-out extension the type allows", () => {
    expect(replacementFilename({ filename: "cover.png", contentType: "image/png" }, { filename: "photo.jpeg", contentType: "image/jpeg" })).toBe("cover.jpeg");
  });

  it("should add the new extension when the old name had none", () => {
    expect(replacementFilename({ filename: "notes", contentType: "text/plain" }, { filename: "a.pdf", contentType: pdf })).toBe("notes.pdf");
  });
});

describe("replaceTargetProblem", () => {
  const plain = { status: "ready", artifactId: "a1", attachedByContent: false };

  it("should allow a plain attachment that no icon or cover shows", () => {
    expect(replaceTargetProblem(plain, { shownAsImage: false })).toBeNull();
  });

  it("should answer not found when the file is missing, unfinished, or in no artifact", () => {
    expect(replaceTargetProblem(null, { shownAsImage: false })).toBe("File not found.");
    expect(replaceTargetProblem({ ...plain, status: "pending" }, { shownAsImage: false })).toBe("File not found.");
    expect(replaceTargetProblem({ ...plain, artifactId: null }, { shownAsImage: false })).toBe("File not found.");
  });

  it("should refuse media a document embeds", () => {
    expect(replaceTargetProblem({ ...plain, attachedByContent: true }, { shownAsImage: false })).toMatch(/shown in the document/);
  });

  it("should refuse an icon or cover image, whose picker checks its own rules", () => {
    expect(replaceTargetProblem(plain, { shownAsImage: true })).toMatch(/icon or cover/);
  });
});

describe("copyCurrentAt", () => {
  it("should count the time from when a copy became current until it was replaced", () => {
    const copy = { currentFrom: minute(10), replacedAt: minute(20) };
    expect(copyCurrentAt(copy, minute(10))).toBe(true);
    expect(copyCurrentAt(copy, minute(19))).toBe(true);
    expect(copyCurrentAt(copy, minute(20))).toBe(false);
    expect(copyCurrentAt(copy, minute(9))).toBe(false);
  });

  it("should count every earlier time for the file as first attached", () => {
    expect(copyCurrentAt({ currentFrom: null, replacedAt: minute(20) }, minute(0))).toBe(true);
  });
});

describe("replacedSince", () => {
  it("should be true only when the file was replaced after the served version was saved", () => {
    expect(replacedSince({ replacedAt: minute(20) }, minute(10))).toBe(true);
    expect(replacedSince({ replacedAt: minute(20) }, minute(20))).toBe(false);
    expect(replacedSince({ replacedAt: null }, minute(10))).toBe(false);
    expect(replacedSince({ replacedAt: minute(20) }, null)).toBe(false);
  });
});

describe("offersReplace", () => {
  const id = "0b4f8a2e-7c1d-4e3a-9b6f-2d8c5e1a7f30";
  const none = { icon: null, cover: null };

  it("should offer Replace for a plain attachment", () => {
    expect(offersReplace({ id, embedded: false }, none)).toBe(true);
  });

  it("should not offer Replace for media the document embeds", () => {
    expect(offersReplace({ id, embedded: true }, none)).toBe(false);
  });

  it("should not offer Replace for the artifact's icon or cover image", () => {
    expect(offersReplace({ id }, { icon: `file:${id}`, cover: null })).toBe(false);
    expect(offersReplace({ id }, { icon: null, cover: `file:${id}@40` })).toBe(false);
  });
});
