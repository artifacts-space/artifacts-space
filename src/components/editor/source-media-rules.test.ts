import { describe, expect, it } from "vitest";

import { fileLimits } from "@/lib/files/config";

import { documentFullProblem } from "./rich/media-upload-rules";
import { mediaLineFor, offsetOfLine, ownParagraphInsert, sourceInsertProblems } from "./source-media-rules";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const line = `![](/api/files/${id})`;

/** The text after the edit. */
function applied(text: string, offset: number): string {
  const { at, insert } = ownParagraphInsert(text, offset, line);
  return `${text.slice(0, at)}${insert}${text.slice(at)}`;
}

describe("mediaLineFor", () => {
  it("should write an image as the document's editor does, with no alt text made from the file name", () => {
    expect(mediaLineFor({ id, filename: "IMG_6266.png", contentType: "image/png" })).toBe(`![](/api/files/${id})`);
  });

  it("should name a PDF and a file, and say what kind each is", () => {
    expect(mediaLineFor({ id, filename: "q3.pdf", contentType: "application/pdf" })).toBe(`![q3.pdf](/api/files/${id}#pdf)`);
    expect(mediaLineFor({ id, filename: "data.csv", contentType: "text/csv" })).toBe(`![data.csv](/api/files/${id}#file)`);
  });
});

describe("offsetOfLine", () => {
  it("should find where a line starts, and stop at the end of the text", () => {
    expect(offsetOfLine("one\ntwo\nthree", 0)).toBe(0);
    expect(offsetOfLine("one\ntwo\nthree", 2)).toBe(8);
    expect(offsetOfLine("one\ntwo", 9)).toBe(7);
  });
});

describe("ownParagraphInsert", () => {
  it("should be the whole text of an empty document", () => {
    expect(applied("", 0)).toBe(`${line}\n`);
  });

  it("should go after the line the cursor is on, as a paragraph of its own", () => {
    expect(applied("First line.\n\nSecond line.", 3)).toBe(`First line.\n\n${line}\n\nSecond line.`);
  });

  it("should not split the line the cursor is in", () => {
    expect(applied("One long line of text.", 4)).toBe(`One long line of text.\n\n${line}\n`);
  });

  it("should keep a paragraph apart from the line that follows it directly", () => {
    expect(applied("First\nSecond", 2)).toBe(`First\n\n${line}\n\nSecond`);
  });

  it("should take the place of a blank line, adding no extra blank lines", () => {
    expect(applied("First\n\n\n\nSecond", 7)).toBe(`First\n\n${line}\n\nSecond`);
  });

  it("should end the text with one line break when it goes last", () => {
    expect(applied("First\n", 6)).toBe(`First\n\n${line}\n`);
    expect(applied("First", 5)).toBe(`First\n\n${line}\n`);
  });

  it("should leave the cursor at the end of the new line, so a second file lands after the first", () => {
    const text = "First\n\nSecond";
    const first = ownParagraphInsert(text, 2, line);
    const once = `${text.slice(0, first.at)}${first.insert}${text.slice(first.at)}`;
    expect(once.slice(0, first.caret)).toBe(`First\n\n${line}`);
    const other = "![q3.pdf](/api/files/11111111-1111-4111-8111-111111111111#pdf)";
    const second = ownParagraphInsert(once, first.caret, other);
    expect(`${once.slice(0, second.at)}${second.insert}${once.slice(second.at)}`).toBe(`First\n\n${line}\n\n${other}\n\nSecond`);
  });

  it("should start the text when the cursor is on a blank first line", () => {
    expect(applied("\nFirst", 0)).toBe(`${line}\n\nFirst`);
  });
});

describe("sourceInsertProblems", () => {
  const limit = fileLimits.maxInlineFilesPerArtifact;
  const pdf = (name: string) => ({ name, type: "application/pdf", size: 2048 });
  /** A source that names `count` different files, one line each. */
  const sourceWith = (count: number) => Array.from({ length: count }, (_, index) => `![](/api/files/00000000-0000-4000-8000-${String(index).padStart(12, "0")})`).join("\n\n");

  it("should take a file while the source names fewer files than a document shows", () => {
    expect(sourceInsertProblems([pdf("a.pdf")], sourceWith(limit - 1), 0)).toEqual([null]);
    expect(sourceInsertProblems([pdf("a.pdf")], "No files yet.", 0)).toEqual([null]);
  });

  it("should refuse the file past the limit in the words the document's editor uses", () => {
    expect(sourceInsertProblems([pdf("a.pdf")], sourceWith(limit), 0)).toEqual([documentFullProblem]);
  });

  it("should count the files of one drop against the room that is left", () => {
    expect(sourceInsertProblems([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")], sourceWith(limit - 2), 0)).toEqual([null, null, documentFullProblem]);
  });

  it("should count files that are still uploading, whose lines are not in the source yet", () => {
    expect(sourceInsertProblems([pdf("a.pdf"), pdf("b.pdf")], sourceWith(limit - 3), 2)).toEqual([null, documentFullProblem]);
  });

  it("should count a file named twice once, and give a file its own problem without using up room", () => {
    const twice = `${sourceWith(limit - 1)}\n\n${sourceWith(1)}`;
    const answers = sourceInsertProblems([{ name: "huge.pdf", type: "application/pdf", size: fileLimits.maxBytes + 1 }, pdf("a.pdf")], twice, 0);
    expect(answers[0]).toContain("The limit is");
    expect(answers[1]).toBeNull();
  });
});
