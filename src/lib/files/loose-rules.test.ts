import { describe, expect, it } from "vitest";

import { addsToDocument, attachesBeside, attachLabel, dropHint, filesPanel, looseFiles, looseFilesWords } from "./loose-rules";

const plain = { id: "11111111-1111-4111-8111-111111111111" };
const embedded = { id: "22222222-2222-4222-8222-222222222222", embedded: true };
const pictured = { id: "33333333-3333-4333-8333-333333333333", pictured: true };
const cover = { id: "44444444-4444-4444-8444-444444444444" };
const icon = { id: "55555555-5555-4555-8555-555555555555" };
const page = { kind: "markdown", content: "# Notes\n\nNo files here.", icon: null, cover: null };

describe("filesPanel", () => {
  it.each(["file", "ui", "canvas"])("should keep the Files section when the format is %s", (kind) => {
    expect(filesPanel(kind)).toBe("section");
  });

  it.each(["markdown", "html", "code", "text", "json", "csv", "svg", "mermaid"])("should show only the list when the format is %s", (kind) => {
    expect(filesPanel(kind)).toBe("list");
  });
});

describe("looseFiles", () => {
  it("should list a plain attachment when the text does not show it", () => {
    expect(looseFiles([plain], page)).toEqual([plain]);
  });

  it("should leave out a file when the text embeds it", () => {
    expect(looseFiles([plain], { ...page, content: `Intro\n\n![](/api/files/${plain.id})\n` })).toEqual([]);
  });

  it("should leave out a file when the text links it, in any letter case", () => {
    expect(looseFiles([plain], { ...page, content: `See [the file](/api/files/${plain.id.toUpperCase()}).` })).toEqual([]);
  });

  it("should list the file again when the text stops showing it", () => {
    const shown = { ...page, content: `![](/api/files/${plain.id})` };
    expect(looseFiles([plain], shown)).toEqual([]);
    expect(looseFiles([plain], { ...shown, content: "" })).toEqual([plain]);
  });

  it("should leave out media a save attached when the text no longer shows it", () => {
    expect(looseFiles([embedded], page)).toEqual([]);
  });

  it("should leave out icon and cover images when the artifact or a version shows them", () => {
    const withImages = { ...page, icon: `file:${icon.id}`, cover: `file:${cover.id}@40` };
    expect(looseFiles([pictured, icon, cover, plain], withImages)).toEqual([plain]);
  });

  it("should keep the artifact's order when several files are loose", () => {
    const second = { id: "66666666-6666-4666-8666-666666666666" };
    expect(looseFiles([second, embedded, plain], page)).toEqual([second, plain]);
  });

  it("should list every plain attachment when the format cannot show files", () => {
    expect(looseFiles([plain], { ...page, kind: "csv", content: `a,b\n/api/files/${plain.id},1` })).toEqual([plain]);
  });
});

describe("addsToDocument", () => {
  it("should offer it for a document only", () => {
    expect(addsToDocument("markdown")).toBe(true);
    expect(addsToDocument("csv")).toBe(false);
    expect(addsToDocument("html")).toBe(false);
  });
});

describe("attachesBeside", () => {
  it.each(["code", "text", "json", "csv", "svg", "mermaid", "html"])("should let a person attach a file beside %s content", (kind) => {
    expect(attachesBeside(kind)).toBe(true);
  });

  it("should not offer it for a document, whose files go into its text", () => {
    expect(attachesBeside("markdown")).toBe(false);
  });

  it.each(["file", "ui", "canvas"])("should leave %s to its Files section", (kind) => {
    expect(attachesBeside(kind)).toBe(false);
  });
});

describe("looseFilesWords", () => {
  it("should say nothing while the list holds no file yet, only uploads on their way", () => {
    expect(looseFilesWords([])).toBe("");
  });

  it("should say the files are not shown on the page when none is a page file", () => {
    expect(looseFilesWords([{}])).toBe("1 file, not shown on the page");
    expect(looseFilesWords([{}, {}])).toBe("2 files, not shown on the page");
  });

  it("should name page files as page files, never as not shown, when the page loads them", () => {
    expect(looseFilesWords([{ pagePath: "css/site.css" }])).toBe("1 page file");
    expect(looseFilesWords([{ pagePath: "css/site.css" }, { pagePath: "app.js" }])).toBe("2 page files");
  });

  it("should count each kind apart when the list holds both", () => {
    expect(looseFilesWords([{ pagePath: "app.js" }, {}, {}])).toBe("1 page file and 2 files not shown on the page");
  });
});

describe("attachLabel and dropHint", () => {
  it("should say Add files for a web page, where files go to the page by their type", () => {
    expect(attachLabel("html")).toBe("Add files");
    expect(dropHint("html")).toBe("Drop to add them to this page");
  });

  it.each(["code", "text", "json", "csv", "svg", "mermaid"])("should keep Attach file for %s", (kind) => {
    expect(attachLabel(kind)).toBe("Attach file");
    expect(dropHint(kind)).toBe("Drop to attach it to this artifact");
  });
});
