import { describe, expect, it } from "vitest";

import { batchStep, caseTwinProblem, inChunks, inPathOrder, pageFilesTotalsWords, publishButtonWords, publishedWords, repeatedPathProblem, reviewBatch, type BatchReview } from "./batch-rules";
import { pageBatchLimits, type HeldPageFile } from "./publish-rules";
import { pageFileLimits, pagePathProblem } from "./rules";

const held: HeldPageFile[] = [
  { id: "h-css", pagePath: "css/site.css", size: 100 },
  { id: "h-logo", pagePath: "img/Logo.png", size: 300 },
];

const clean: BatchReview = { pathProblems: new Map(), setProblem: null, replaces: new Map() };

describe("reviewBatch", () => {
  it("should say which file replaces a held file at the same path", () => {
    const review = reviewBatch([{ key: "a", path: "css/site.css", size: 10 }, { key: "b", path: "js/app.js", size: 10 }], held);
    expect([...review.replaces]).toEqual([["a", "css/site.css"]]);
    expect(review.pathProblems.size).toBe(0);
    expect(review.setProblem).toBeNull();
  });

  it("should name a path the rules refuse, a case twin of a held path, and a path two files share", () => {
    const review = reviewBatch([
      { key: "space", path: "Hero Image.png", size: 10 },
      { key: "twin", path: "img/logo.png", size: 10 },
      { key: "one", path: "js/a.js", size: 10 },
      { key: "two", path: "JS/A.js", size: 10 },
    ], held);
    expect(review.pathProblems.get("space")).toBe(pagePathProblem("Hero Image.png"));
    expect(review.pathProblems.get("twin")).toBe(caseTwinProblem("img/Logo.png"));
    expect(review.pathProblems.get("one")).toBe(repeatedPathProblem);
    expect(review.pathProblems.get("two")).toBe(repeatedPathProblem);
  });

  it("should check the page's limits for the set as a whole once every path is fine", () => {
    const many = Array.from({ length: pageFileLimits.maxFiles }, (_, index) => ({ key: `k${String(index)}`, path: `img/p${String(index)}.png`, size: 10 }));
    const review = reviewBatch(many, held);
    expect(review.pathProblems.size).toBe(0);
    expect(review.setProblem).toContain(String(pageFileLimits.maxFiles));
  });

  it("should count a replacing file in the held file's place, so a full page can still take replacements", () => {
    const full: HeldPageFile[] = Array.from({ length: pageFileLimits.maxFiles }, (_, index) => ({ id: `h${String(index)}`, pagePath: `f${String(index)}.css`, size: 10 }));
    expect(reviewBatch([{ key: "a", path: "f0.css", size: 20 }], full).setProblem).toBeNull();
    expect(reviewBatch([{ key: "a", path: "new.css", size: 20 }], full).setProblem).not.toBeNull();
  });
});

describe("batchStep", () => {
  it("should wait for a fix, for room, for a failed upload, and for uploads on their way, in that order", () => {
    const fix: BatchReview = { ...clean, pathProblems: new Map([["a", "bad"]]) };
    expect(batchStep(["failed"], fix, false)).toBe("fix");
    expect(batchStep(["failed"], { ...clean, setProblem: "too many" }, false)).toBe("too-many");
    expect(batchStep(["ready", "failed"], clean, false)).toBe("failed");
    expect(batchStep(["ready", "uploading", "waiting"], clean, false)).toBe("working");
  });

  it("should publish by itself only when the set replaces nothing", () => {
    expect(batchStep(["ready"], clean, false)).toBe("publish");
    const replacing: BatchReview = { ...clean, replaces: new Map([["a", "css/site.css"]]) };
    expect(batchStep(["ready"], replacing, false)).toBe("confirm");
    expect(batchStep(["ready"], replacing, true)).toBe("publish");
  });

  it("should have nothing to do with no files", () => {
    expect(batchStep([], clean, true)).toBe("empty");
  });
});

describe("inChunks", () => {
  it("should split a large site into requests within the cap, in order", () => {
    const keys = Array.from({ length: 101 }, (_, index) => index);
    const chunks = inChunks(keys, pageBatchLimits.maxUploadsPerRequest);
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 1]);
    expect(chunks.flat()).toEqual(keys);
  });
});

describe("words", () => {
  it("should say what the set's button does", () => {
    expect(publishButtonWords(1, 0)).toBe("Add 1 file");
    expect(publishButtonWords(3, 3)).toBe("Replace 3 files");
    expect(publishButtonWords(3, 1)).toBe("Add and replace 3 files");
  });

  it("should say what a publish did, and that it waits for approval when it does", () => {
    expect(publishedWords({ added: ["a.css", "b.css"], replaced: [], removed: [], status: "applied" })).toBe("Added 2 files to the page.");
    expect(publishedWords({ added: [], replaced: ["css/site.css"], removed: [], status: "pending" })).toBe("Replaced css/site.css. The old copy is in History. Readers outside the team see it once a team owner or admin approves it.");
    expect(publishedWords({ added: [], replaced: [], removed: ["js/old.js"], status: "applied" })).toBe("Removed js/old.js.");
  });

  it("should state the page's room against its limits", () => {
    expect(pageFilesTotalsWords([{ size: 1024 * 1024 }, { size: 400 * 1024 }])).toBe("2 of 100 files, 1.4 MB of 16 MB");
  });
});

describe("inPathOrder", () => {
  it("should list the page's own folder first, then folders by path", () => {
    const files = [{ pagePath: "js/app.js" }, { pagePath: "data.json" }, { pagePath: "css/site.css" }, { pagePath: "about.txt" }];
    expect(inPathOrder(files).map((file) => file.pagePath)).toEqual(["about.txt", "data.json", "css/site.css", "js/app.js"]);
  });
});
