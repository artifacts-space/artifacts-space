import { describe, expect, it } from "vitest";

import { countsArePartial, groupCount, listLimit, moreRow, narrowsTree, sidebarViewCounts, unfiledCount, type SidebarNarrowing } from "./sidebar-count-rules";

const none: SidebarNarrowing = { query: "", kind: "all", view: "all", tags: [], project: false };
const viewer = "viewer-1";

/** `count` list items, the first `shared` written by someone else and the first `shown` public. */
function items(count: number, options: { shared?: number; shown?: number } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    authorId: index < (options.shared ?? 0) ? "someone-else" : viewer,
    visibility: index < (options.shown ?? 0) ? "public" : "private",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }));
}

describe("narrowsTree", () => {
  it("should narrow the tree when a search, a format, a view, or a tag is on", () => {
    expect(narrowsTree({ ...none, query: " plan " })).toBe(true);
    expect(narrowsTree({ ...none, kind: "csv" })).toBe(true);
    expect(narrowsTree({ ...none, view: "public" })).toBe(true);
    expect(narrowsTree({ ...none, tags: ["launch"] })).toBe(true);
  });

  it("should not narrow the tree when only the project filter or a blank search is on", () => {
    expect(narrowsTree({ ...none, project: true })).toBe(false);
    expect(narrowsTree({ ...none, query: "   " })).toBe(false);
  });
});

describe("sidebarViewCounts", () => {
  const totals = { total: 340, shared: 12, public: 30 };

  it("should show the server's totals when there are more than 100 artifacts and no filter is on", () => {
    expect(sidebarViewCounts(totals, none, items(listLimit, { shared: 3, shown: 5 }), viewer)).toEqual({ all: 340, shared: 12, public: 30 });
  });

  it("should never show fewer than the list holds when an artifact was made since the page loaded", () => {
    expect(sidebarViewCounts({ total: 3, shared: 0, public: 0 }, none, items(4, { shown: 1 }), viewer)).toEqual({ all: 4, shared: 0, public: 1 });
  });

  it("should count only the matches when a tag filter is on", () => {
    expect(sidebarViewCounts(totals, { ...none, tags: ["launch"] }, items(7, { shared: 2, shown: 1 }), viewer)).toEqual({ all: 7, shared: 2, public: 1 });
  });

  it("should count only the matches when a format filter is on", () => {
    expect(sidebarViewCounts(totals, { ...none, kind: "csv" }, items(2), viewer)).toEqual({ all: 2, shared: 0, public: 0 });
  });

  it("should count the filtered project's artifacts when the project filter is on", () => {
    expect(sidebarViewCounts(totals, { ...none, project: true }, items(9, { shown: 4 }), viewer)).toEqual({ all: 9, shared: 0, public: 4 });
  });
});

describe("countsArePartial", () => {
  it("should flag counts read from a list cut at 100 while a filter is on", () => {
    expect(countsArePartial({ ...none, kind: "csv" }, listLimit)).toBe(true);
    expect(countsArePartial({ ...none, project: true }, listLimit)).toBe(true);
  });

  it("should not flag the server's counts, or a list that holds every match", () => {
    expect(countsArePartial(none, listLimit)).toBe(false);
    expect(countsArePartial({ ...none, tags: ["launch"] }, listLimit - 1)).toBe(false);
  });
});

describe("groupCount", () => {
  it("should show the server's count when nothing narrows the tree, and never fewer than its rows", () => {
    expect(groupCount(false, 40, 7)).toEqual({ count: 40, shown: 7 });
    expect(groupCount(false, 2, 3)).toEqual({ count: 3, shown: 3 });
  });

  it("should show only the rows listed while the tree is narrowed", () => {
    expect(groupCount(true, 40, 2)).toEqual({ count: 2, shown: 2 });
  });
});

describe("unfiledCount", () => {
  it("should count every artifact no project entry holds, including ones whose project has no entry", () => {
    // 340 artifacts, 300 in the tree's projects: 30 with no project, 10 in a project the viewer cannot use here.
    expect(unfiledCount(340, [200, 100])).toBe(40);
  });

  it("should never go below zero when moves shift the counts before fresh totals arrive", () => {
    expect(unfiledCount(3, [2, 2])).toBe(0);
  });
});

describe("moreRow", () => {
  const open = { narrowed: false, filterOn: false, active: false };

  it("should offer Show all when a project lists 7 of its 40 artifacts and no filter is on", () => {
    expect(moreRow({ count: 40, shown: 7 }, open)).toEqual({ kind: "show-all", shown: 7, count: 40 });
  });

  it("should say the newest are shown when the project's own filter is on and it holds more than the list", () => {
    expect(moreRow({ count: 340, shown: listLimit }, { ...open, filterOn: true, active: true })).toEqual({ kind: "newest", shown: listLimit, count: 340 });
  });

  it("should show nothing when every artifact is listed, the tree is narrowed, or another project's filter is on", () => {
    expect(moreRow({ count: 7, shown: 7 }, open)).toBeNull();
    expect(moreRow({ count: 40, shown: 7 }, { ...open, narrowed: true })).toBeNull();
    expect(moreRow({ count: 40, shown: 0 }, { ...open, filterOn: true })).toBeNull();
  });
});
