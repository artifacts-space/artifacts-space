import { describe, expect, it } from "vitest";

import { fileLimits } from "@/lib/files/config";

import { emptyFileProblem, leftOutOfDrop, leftOutWords, pathsInDrop, replacementPickProblem, routeDrop, suggestPagePath, type DroppedEntry } from "./drop-rules";
import { pagePathProblem } from "./rules";

const loose = (name: string, size = 10, type = ""): DroppedEntry => ({ name, size, type, relativePath: name, fromFolder: false });
const inFolder = (relativePath: string, size = 10, type = ""): DroppedEntry => ({ name: relativePath.slice(relativePath.lastIndexOf("/") + 1), size, type, relativePath, fromFolder: true });

describe("pathsInDrop", () => {
  it("should leave out the one folder that holds the whole drop", () => {
    expect(pathsInDrop(["site/css/site.css", "site/img/logo.png", "site/index.html"])).toEqual(["css/site.css", "img/logo.png", "index.html"]);
  });

  it("should keep each folder's name when the drop holds several, or loose files beside one", () => {
    expect(pathsInDrop(["css/site.css", "img/logo.png"])).toEqual(["css/site.css", "img/logo.png"]);
    expect(pathsInDrop(["site/css/site.css", "logo.png"])).toEqual(["site/css/site.css", "logo.png"]);
  });

  it("should land single files at the top level under their own names", () => {
    expect(pathsInDrop(["logo.png", "site.css"])).toEqual(["logo.png", "site.css"]);
  });
});

describe("leftOutOfDrop", () => {
  it("should leave out system files wherever they are", () => {
    expect(leftOutOfDrop({ relativePath: ".DS_Store", fromFolder: false })).toBe(true);
    expect(leftOutOfDrop({ relativePath: "site/img/Thumbs.db", fromFolder: true })).toBe(true);
    expect(leftOutOfDrop({ relativePath: "__MACOSX/site/._logo.png", fromFolder: true })).toBe(true);
  });

  it("should leave out hidden files and hidden folders inside a dropped folder", () => {
    expect(leftOutOfDrop({ relativePath: "site/.env", fromFolder: true })).toBe(true);
    expect(leftOutOfDrop({ relativePath: "site/.git/config.json", fromFolder: true })).toBe(true);
  });

  it("should keep a hidden file the person dropped by itself, and every ordinary file", () => {
    expect(leftOutOfDrop({ relativePath: ".config.json", fromFolder: false })).toBe(false);
    expect(leftOutOfDrop({ relativePath: "site/css/site.css", fromFolder: true })).toBe(false);
  });
});

describe("suggestPagePath", () => {
  it("should turn spaces into dashes and capitals into lowercase", () => {
    expect(suggestPagePath("Hero Image.PNG")).toBe("hero-image.png");
    expect(suggestPagePath("CSS/Site  Main.css")).toBe("css/site-main.css");
  });

  it("should drop leading dots, characters a path cannot hold, and empty parts", () => {
    expect(suggestPagePath(".config.json")).toBe("config.json");
    expect(suggestPagePath("img//logo (2).png")).toBe("img/logo-2-.png");
    expect(suggestPagePath("../../a.css")).toBe("a.css");
  });

  it("should give a path the rules accept for ordinary names", () => {
    for (const name of ["My Page Styles.css", "Données.json", "logo@2x.png", "About Us.HTML", "old.htm"]) expect(pagePathProblem(suggestPagePath(name))).toBeNull();
  });
});

describe("routeDrop", () => {
  it("should make page-file types page files at their path in the drop, and other allowed types attachments", () => {
    const routes = routeDrop([inFolder("site/css/site.css"), inFolder("site/img/logo.png"), inFolder("site/docs/brief.pdf", 10, "application/pdf")]);
    expect(routes).toEqual([{ kind: "page", path: "css/site.css" }, { kind: "page", path: "img/logo.png" }, { kind: "attachment" }]);
  });

  it("should keep a page file whose path needs fixing, so the person can fix it", () => {
    expect(routeDrop([loose("Hero Image.png")])).toEqual([{ kind: "page", path: "Hero Image.png" }]);
  });

  it("should take one index.html at the top of the drop as the page itself", () => {
    expect(routeDrop([inFolder("site/index.html"), inFolder("site/app.js")])[0]).toEqual({ kind: "page-html", path: "index.html" });
  });

  it("should make every other HTML file another page of the site, at its path in the drop", () => {
    const routes = routeDrop([inFolder("site/index.html"), inFolder("site/about.html"), inFolder("site/docs/guide.html"), inFolder("site/docs/index.html")]);
    expect(routes).toEqual([{ kind: "page-html", path: "index.html" }, { kind: "page", path: "about.html" }, { kind: "page", path: "docs/guide.html" }, { kind: "page", path: "docs/index.html" }]);
  });

  it("should keep an .htm page in its row with a path to fix, and refuse a second index.html at the top", () => {
    expect(routeDrop([loose("Old Page.htm")])).toEqual([{ kind: "page", path: "Old Page.htm" }]);
    expect(suggestPagePath("Old Page.htm")).toBe("old-page.html");
    const [first, second] = routeDrop([loose("index.html"), loose("INDEX.HTML")]);
    expect(first).toEqual({ kind: "refused", problem: pagePathProblem("index.html") });
    expect(second?.kind).toBe("refused");
  });

  it("should refuse a type the site does not take, an empty file, and a file over the limit", () => {
    const [program, empty, big] = routeDrop([loose("setup.exe"), loose("empty.css", 0), loose("huge.js", fileLimits.maxBytes + 1)]);
    expect(program?.kind).toBe("refused");
    expect(empty).toEqual({ kind: "refused", problem: emptyFileProblem });
    expect(big?.kind).toBe("refused");
  });

  it("should leave out hidden and system files", () => {
    expect(routeDrop([inFolder("site/.DS_Store"), inFolder("site/a.css")]).map((route) => route.kind)).toEqual(["left-out", "page"]);
  });
});

describe("leftOutWords", () => {
  it("should say nothing when no file was left out, and count them otherwise", () => {
    expect(leftOutWords(0)).toBeNull();
    expect(leftOutWords(1)).toBe("Left out 1 hidden or system file.");
    expect(leftOutWords(3)).toBe("Left out 3 hidden or system files.");
  });
});

describe("replacementPickProblem", () => {
  it("should take a file of the same type for a page file's path", () => {
    expect(replacementPickProblem("css/site.css", { name: "new-styles.css", size: 10 })).toBeNull();
    expect(replacementPickProblem("img/photo.jpg", { name: "photo.jpeg", size: 10 })).toBeNull();
  });

  it("should refuse a file of another type, which the path would serve as the wrong type", () => {
    expect(replacementPickProblem("css/site.css", { name: "logo.png", size: 10 })).toContain("css/site.css");
  });

  it("should refuse an empty file and one over the limit, as a drop does, so no path field is offered for them", () => {
    expect(replacementPickProblem("css/site.css", { name: "site.css", size: 0 })).toBe(emptyFileProblem);
    expect(replacementPickProblem("css/site.css", { name: "site.css", size: fileLimits.maxBytes + 1 })).toContain("The limit is");
  });
});
