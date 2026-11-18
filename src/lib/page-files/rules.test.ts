import { describe, expect, it, vi } from "vitest";

import { askAgainOnFailure, checkPagePath, pageFileContentTypes, pageFileLabel, pageFileLimits, pageFileName, pageFileTotalsProblem, pageFileTypeFor, pagePathProblem, replacementPathProblem, servedContentType } from "./rules";

describe("pagePathProblem", () => {
  it.each(["site.css", "css/site.css", "js/app.js", "js/vendor/chart.min.mjs", "img/logo_2x.png", "fonts/Inter-Regular.woff2", "data.json", "a/b/c/d/e/f/g/h.js", "app.js.map"])("should accept %s", (path) => {
    expect(pagePathProblem(path)).toBeNull();
  });

  it.each([
    ["", "Give the page file a path"],
    ["/site.css", "no empty part"],
    ["css//site.css", "no empty part"],
    ["css/site.css/", "no empty part"],
    ["../site.css", '"." or ".."'],
    ["css/../../site.css", '"." or ".."'],
    ["./site.css", '"." or ".."'],
    ["css\\site.css", "only letters, digits"],
    ["css/si te.css", "only letters, digits"],
    ["css/site.css?x=1", "only letters, digits"],
    ["css/%2e%2e/site.css", "only letters, digits"],
    ["café.css", "only letters, digits"],
    [".hidden/site.css", "cannot start with a dot"],
    ["css/.site.css", "cannot start with a dot"],
    ["a/b/c/d/e/f/g/h/i.js", "parts deep"],
    [`${"a".repeat(200)}.css`, "at most 200 characters"],
  ])("should refuse %s", (path, reason) => {
    expect(pagePathProblem(path)).toContain(reason);
  });

  it("should take another page of the site, at the top or in a folder", () => {
    for (const path of ["about.html", "docs/guide.html", "docs/index.html", "a/b/c/d/e/f/g/page.html", "Guide-2_x.v1.html"]) expect(pagePathProblem(path), path).toBeNull();
  });

  it("should refuse the page's own name at the top, in any letter case, and say it is the artifact's content", () => {
    for (const path of ["index.html", "INDEX.HTML", "Index.html"]) expect(pagePathProblem(path), path).toContain("index.html is the page itself");
  });

  it("should refuse .htm and an .html name that is not in lowercase, so every page has an address the page host knows", () => {
    expect(pagePathProblem("pages/about.htm")).toBe("A page of the site ends in .html: name it pages/about.html.");
    for (const path of ["about.HTML", "docs/Guide.Html", "a..html"]) expect(pagePathProblem(path), path).toContain("ends in .html");
  });

  it("should refuse a type no page file may be, and a file without an extension", () => {
    for (const path of ["run.exe", "archive.zip", "report.pdf", "script.php", "Makefile", "app.jsx", "page.xhtml"]) {
      expect(pagePathProblem(path), path).toContain("cannot be a page file");
    }
  });
});

describe("page file types", () => {
  it("should take the type from the path's extension alone, in any letter case", () => {
    expect(pageFileTypeFor("css/site.css")?.contentType).toBe("text/css");
    expect(pageFileTypeFor("js/app.js")?.contentType).toBe("text/javascript");
    expect(pageFileTypeFor("js/app.MJS")?.contentType).toBe("text/javascript");
    expect(pageFileTypeFor("img/logo.svg")?.contentType).toBe("image/svg+xml");
    expect(pageFileTypeFor("fonts/a.woff2")?.contentType).toBe("font/woff2");
    expect(pageFileTypeFor("mod.wasm")?.contentType).toBe("application/wasm");
    expect(pageFileTypeFor("photo.JPG")?.contentType).toBe("image/jpeg");
    expect(pageFileTypeFor("index.html")).toBeNull();
    expect(pageFileTypeFor("about.html")?.contentType).toBe("text/html");
    expect(pageFileTypeFor("../a.css")).toBeNull();
  });

  it("should check a path before an upload starts", () => {
    expect(checkPagePath("css/site.css")).toEqual({ ok: true, contentType: "text/css" });
    expect(checkPagePath("css/site.html")).toEqual({ ok: true, contentType: "text/html" });
    expect(checkPagePath("css/site.htm")).toMatchObject({ ok: false });
    expect(checkPagePath("/css/site.css")).toMatchObject({ ok: false });
  });

  it("should serve text as UTF-8 and everything else as stored", () => {
    expect(servedContentType("text/css")).toBe("text/css; charset=utf-8");
    expect(servedContentType("text/javascript")).toBe("text/javascript; charset=utf-8");
    expect(servedContentType("image/svg+xml")).toBe("image/svg+xml; charset=utf-8");
    expect(servedContentType("font/woff2")).toBe("font/woff2");
    expect(servedContentType("image/png")).toBe("image/png");
  });

  it("should never serve a page file as HTML: another page of the site is served as plain text", () => {
    for (const type of pageFileContentTypes) expect(servedContentType(type), type).not.toMatch(/html/);
    expect(servedContentType("text/html")).toBe("text/plain; charset=utf-8");
    // The one HTML type is the page's: stored so, for its downloads, and never served so.
    expect(pageFileContentTypes.filter((type) => type.includes("html"))).toEqual(["text/html"]);
    // SVG is the one type served here that a browser can run as a document; its answer is sandboxed (pageFilePolicy).
    expect(pageFileContentTypes.filter((type) => type.endsWith("xml"))).toEqual(["image/svg+xml"]);
  });

  it("should name a type for people, and a file by the last part of its path", () => {
    expect(pageFileLabel("text/css")).toBe("Stylesheet");
    expect(pageFileLabel("text/html")).toBe("HTML page");
    expect(pageFileLabel("application/x-unknown")).toBe("File");
    expect(pageFileName("css/site.css")).toBe("site.css");
    expect(pageFileName("site.css")).toBe("site.css");
  });
});

describe("pageFileTotalsProblem", () => {
  it("should accept page files up to the limits and refuse one more file or one more byte", () => {
    expect(pageFileTotalsProblem({ count: pageFileLimits.maxFiles, bytes: pageFileLimits.maxTotalBytes })).toBeNull();
    expect(pageFileTotalsProblem({ count: pageFileLimits.maxFiles + 1, bytes: 1 })).toContain("at most 100 page files");
    expect(pageFileTotalsProblem({ count: 1, bytes: pageFileLimits.maxTotalBytes + 1 })).toContain("The limit is 16 MB");
  });
});

describe("replacementPathProblem", () => {
  it("should let a page file be replaced only by an upload requested for its own path", () => {
    expect(replacementPathProblem({ pagePath: "css/site.css" }, { pagePath: "css/site.css" })).toBeNull();
    expect(replacementPathProblem({ pagePath: "css/site.css" }, { pagePath: "css/other.css" })).toContain("same pagePath");
    expect(replacementPathProblem({ pagePath: "css/site.css" }, { pagePath: null })).toContain("same pagePath");
  });

  it("should never let an upload requested as a page file replace a plain attachment", () => {
    expect(replacementPathProblem({ pagePath: null }, { pagePath: null })).toBeNull();
    expect(replacementPathProblem({ pagePath: null }, { pagePath: "js/app.js" })).toContain("requested as a page file");
  });
});

describe("askAgainOnFailure", () => {
  it("should take the first answer, a refusal included, without asking again", async () => {
    const granted = vi.fn().mockResolvedValue("address");
    const refused = vi.fn().mockResolvedValue(null);
    await expect(askAgainOnFailure(granted)).resolves.toBe("address");
    await expect(askAgainOnFailure(refused)).resolves.toBeNull();
    expect(granted).toHaveBeenCalledTimes(1);
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it("should ask once more when the call itself fails, and give up after that", async () => {
    const dropped = vi.fn().mockRejectedValueOnce(new Error("dropped")).mockResolvedValue("address");
    await expect(askAgainOnFailure(dropped)).resolves.toBe("address");
    expect(dropped).toHaveBeenCalledTimes(2);
    const down = vi.fn().mockRejectedValue(new Error("down"));
    await expect(askAgainOnFailure(down)).rejects.toThrow("down");
    expect(down).toHaveBeenCalledTimes(2);
  });
});
