import { describe, expect, it } from "vitest";

import { asDropped, filesUnder, type EntryLike } from "./dropped-files";

/** A file entry of a fake drop. */
function fileEntry(fullPath: string): EntryLike & { file: (done: (file: File) => void) => void } {
  const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
  return { name, fullPath, isFile: true, isDirectory: false, file: (done) => { done(new File(["x"], name)); } };
}

/** A folder entry whose reader hands over its children in batches of two, then none, as browsers do in batches of up to a hundred. */
function folderEntry(fullPath: string, children: EntryLike[]): EntryLike & { createReader: () => { readEntries: (done: (entries: EntryLike[]) => void) => void } } {
  return {
    name: fullPath.slice(fullPath.lastIndexOf("/") + 1),
    fullPath,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return { readEntries: (done) => { const batch = children.slice(at, at + 2); at += 2; done(batch); } };
    },
  };
}

describe("filesUnder", () => {
  it("should read every file of a dropped folder with its path from the top of the drop", async () => {
    const site = folderEntry("/site", [
      folderEntry("/site/css", [fileEntry("/site/css/site.css")]),
      folderEntry("/site/img", [fileEntry("/site/img/logo.png"), fileEntry("/site/img/bg.png"), fileEntry("/site/img/icon.svg")]),
      fileEntry("/site/index.html"),
    ]);
    const found = await filesUnder([site]);
    expect(found.map((entry) => entry.relativePath)).toEqual(["site/css/site.css", "site/img/logo.png", "site/img/bg.png", "site/img/icon.svg", "site/index.html"]);
    expect(found.every((entry) => entry.fromFolder)).toBe(true);
  });

  it("should keep a file dropped beside a folder at its own name, not from a folder", async () => {
    const found = await filesUnder([folderEntry("/css", [fileEntry("/css/a.css")]), fileEntry("/logo.png")]);
    expect(found.map(({ relativePath, fromFolder }) => ({ relativePath, fromFolder }))).toEqual([{ relativePath: "css/a.css", fromFolder: true }, { relativePath: "logo.png", fromFolder: false }]);
  });
});

describe("asDropped", () => {
  it("should take a picked file at its own name", () => {
    expect(asDropped(new File(["x"], "logo.png"))).toMatchObject({ relativePath: "logo.png", fromFolder: false });
  });
});
