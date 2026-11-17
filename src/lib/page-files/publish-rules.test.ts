import { describe, expect, it } from "vitest";

import { fileLimits } from "@/lib/files/config";

import { faultsMessage, inBatches, pageBatchLimits, planPagePublish, repeatedPaths, type HeldPageFile } from "./publish-rules";
import { pageFileLimits } from "./rules";

const held: HeldPageFile[] = [
  { id: "h-css", pagePath: "css/site.css", size: 100 },
  { id: "h-js", pagePath: "js/app.js", size: 200 },
  { id: "h-logo", pagePath: "img/Logo.png", size: 300 },
];

function faultsOf(check: ReturnType<typeof planPagePublish>) {
  return check.ok ? [] : check.faults.map((fault) => fault.path);
}

describe("planPagePublish", () => {
  it("should add files at new paths and replace files at paths the page has", () => {
    const check = planPagePublish([{ path: "css/site.css", size: 150 }, { path: "js/chart.js", size: 50 }], [], held);
    if (!check.ok) throw new Error("The set was refused.");
    expect(check.plan.adds).toEqual([{ path: "js/chart.js", size: 50 }]);
    expect(check.plan.replaces).toEqual([{ file: { path: "css/site.css", size: 150 }, held: held[0] }]);
    expect(check.plan.removes).toEqual([]);
    // The replaced file counts in the old one's place: 3 held + 1 new, and 150 for the 100 it replaces.
    expect(check.plan.totals).toEqual({ count: 4, bytes: 150 + 200 + 300 + 50 });
  });

  it("should remove held files by exact path and count them no more", () => {
    const check = planPagePublish([], ["js/app.js"], held);
    if (!check.ok) throw new Error("The set was refused.");
    expect(check.plan.removes).toEqual([held[1]]);
    expect(check.plan.totals).toEqual({ count: 2, bytes: 400 });
  });

  it("should name every file at fault, not only the first", () => {
    const check = planPagePublish(
      [{ path: "../secret.css", size: 10 }, { path: "page.html", size: 10 }, { path: "app.exe", size: 10 }, { path: "css/ok.css", size: 0 }, { path: "css/big.css", size: fileLimits.maxBytes + 1 }, { path: "css/fine.css", size: 10 }],
      ["js/missing.js"],
      held,
    );
    expect(faultsOf(check)).toEqual(["../secret.css", "page.html", "app.exe", "css/ok.css", "css/big.css", "js/missing.js"]);
  });

  it("should refuse a path named twice, and twice with different letter case", () => {
    expect(faultsOf(planPagePublish([{ path: "a.css", size: 1 }, { path: "a.css", size: 2 }], [], []))).toEqual(["a.css"]);
    expect(faultsOf(planPagePublish([{ path: "img/a.png", size: 1 }, { path: "img/A.png", size: 2 }], [], []))).toEqual(["img/a.png"]);
  });

  it("should refuse a path that differs only by letter case from one the page has, even when that one is removed in the same call", () => {
    expect(faultsOf(planPagePublish([{ path: "img/logo.png", size: 1 }], [], held))).toEqual(["img/logo.png"]);
    expect(faultsOf(planPagePublish([{ path: "img/logo.png", size: 1 }], ["img/Logo.png"], held))).toEqual(["img/logo.png"]);
  });

  it("should refuse a path that is both uploaded and removed, a removal of a path the page does not have, and a removal named twice", () => {
    expect(faultsOf(planPagePublish([{ path: "css/site.css", size: 1 }], ["css/site.css"], held))).toEqual(["css/site.css"]);
    expect(faultsOf(planPagePublish([], ["CSS/site.css"], held))).toEqual(["CSS/site.css"]);
    expect(faultsOf(planPagePublish([], ["js/app.js", "js/app.js"], held))).toEqual(["js/app.js"]);
  });

  it("should check the limits for the page as the set leaves it", () => {
    const full: HeldPageFile[] = Array.from({ length: pageFileLimits.maxFiles }, (_unused, index) => ({ id: `h${String(index)}`, pagePath: `f${String(index)}.css`, size: 1 }));
    // One more is too many; one more with one removed fits; a replacement adds none.
    expect(planPagePublish([{ path: "new.css", size: 1 }], [], full).ok).toBe(false);
    expect(planPagePublish([{ path: "new.css", size: 1 }], ["f0.css"], full).ok).toBe(true);
    expect(planPagePublish([{ path: "f0.css", size: 1 }], [], full).ok).toBe(true);

    const big: HeldPageFile[] = [{ id: "big", pagePath: "img/big.png", size: pageFileLimits.maxTotalBytes - 100 }];
    const over = planPagePublish([{ path: "img/a.png", size: 60 }, { path: "img/b.png", size: 60 }], [], big);
    const overFaults = over.ok ? [] : over.faults;
    expect(overFaults.map((fault) => fault.path)).toEqual(["(all files)"]);
    expect(overFaults[0]?.problem).toContain("The limit is 16 MB");
    expect(planPagePublish([{ path: "img/a.png", size: 60 }, { path: "img/b.png", size: 40 }], [], big).ok).toBe(true);
    // Replacing the big file makes room for what would not fit beside it.
    expect(planPagePublish([{ path: "img/big.png", size: 10 }, { path: "img/a.png", size: 1000 }], [], big).ok).toBe(true);
  });
});

describe("repeatedPaths", () => {
  it("should name each repeated path once, as first written", () => {
    expect(repeatedPaths(["a.css", "b.css", "A.css", "a.css", "c.css"])).toEqual(["a.css"]);
    expect(repeatedPaths(["a.css", "b.css"])).toEqual([]);
  });
});

describe("faultsMessage", () => {
  it("should put every file at fault on its own line under the lead", () => {
    expect(faultsMessage("Fix these:", [{ path: "a.css", problem: "Too big." }, { path: "b.js", problem: "Empty." }])).toBe("Fix these:\n- a.css: Too big.\n- b.js: Empty.");
  });
});

describe("inBatches", () => {
  it("should keep the items' order and never run more than the given number at once", async () => {
    let running = 0;
    let most = 0;
    const results = await inBatches([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(most).toBe(3);
  });
});

describe("pageBatchLimits", () => {
  it("should let one publish name as many files as one artifact holds, start a whole site's uploads in two calls, and leave room to ask for it again", () => {
    expect(pageBatchLimits.maxFilesPerPublish).toBe(pageFileLimits.maxFiles);
    expect(pageBatchLimits.maxUploadsPerRequest * 2).toBeGreaterThanOrEqual(pageFileLimits.maxFiles);
    expect(pageBatchLimits.maxPendingUploads).toBe(pageFileLimits.maxFiles * 2);
  });
});
