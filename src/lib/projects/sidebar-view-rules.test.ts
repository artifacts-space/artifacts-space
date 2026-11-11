import { describe, expect, it } from "vitest";

import { focusesSearch, groupByProject, matchesView, projectDotIndex, recentWindowMs, sharedWithViewer, viewCounts, type ViewItem } from "./sidebar-view-rules";

const now = new Date("2026-11-10T12:00:00Z");
const item = (overrides: Partial<ViewItem> = {}): ViewItem => ({ authorId: "me", visibility: "private", updatedAt: now.toISOString(), ...overrides });

describe("sharedWithViewer", () => {
  it("should count an artifact as shared when someone else wrote it", () => {
    expect(sharedWithViewer(item({ authorId: "teammate" }), "me")).toBe(true);
  });

  it("should not count the viewer's own artifact or one their agent wrote as shared", () => {
    expect(sharedWithViewer(item(), "me")).toBe(false);
    expect(sharedWithViewer(item({ authorId: "agent-1", actsForAuthor: true }), "me")).toBe(false);
  });
});

describe("matchesView", () => {
  it("should show everything in All artifacts", () => {
    expect(matchesView(item({ authorId: "x", visibility: "team" }), "all", "me", now)).toBe(true);
  });

  it("should show only public artifacts in Public", () => {
    expect(matchesView(item({ visibility: "public" }), "public", "me", now)).toBe(true);
    expect(matchesView(item({ visibility: "link" }), "public", "me", now)).toBe(false);
  });

  it("should show only artifacts edited in the last seven days in Recent", () => {
    const edge = new Date(now.getTime() - recentWindowMs).toISOString();
    const older = new Date(now.getTime() - recentWindowMs - 60_000).toISOString();
    expect(matchesView(item({ updatedAt: edge }), "recent", "me", now)).toBe(true);
    expect(matchesView(item({ updatedAt: older }), "recent", "me", now)).toBe(false);
  });

  it("should show everything in Recent while the time is not known yet", () => {
    expect(matchesView(item({ updatedAt: "2020-01-01T00:00:00Z" }), "recent", "me", null)).toBe(true);
  });

  it("should show only others' artifacts in Shared with me", () => {
    expect(matchesView(item({ authorId: "teammate" }), "shared", "me", now)).toBe(true);
    expect(matchesView(item(), "shared", "me", now)).toBe(false);
  });
});

describe("viewCounts", () => {
  it("should count all, shared, and public artifacts in one list", () => {
    const counts = viewCounts([item(), item({ authorId: "teammate", visibility: "public" }), item({ visibility: "public" })], "me");
    expect(counts).toEqual({ all: 3, shared: 1, public: 2 });
  });

  it("should count nothing when the list is empty", () => {
    expect(viewCounts([], "me")).toEqual({ all: 0, shared: 0, public: 0 });
  });
});

describe("groupByProject", () => {
  const keyOf = (entry: { key: string | null }) => entry.key;

  it("should group artifacts under their projects in the entries' order with Unfiled last", () => {
    const groups = groupByProject([{ id: "a", key: "beta" }, { id: "b", key: null }, { id: "c", key: "alpha" }], ["alpha", "beta"], keyOf);
    expect(groups.map((group) => [group.key, group.items.map((entry) => entry.id)])).toEqual([["alpha", ["c"]], ["beta", ["a"]], [null, ["b"]]]);
  });

  it("should keep an empty project as a group so it can take a dropped artifact", () => {
    const groups = groupByProject([], ["alpha"], keyOf);
    expect(groups).toEqual([{ key: "alpha", items: [] }, { key: null, items: [] }]);
  });

  it("should list an artifact whose project has no entry under Unfiled instead of losing it", () => {
    const groups = groupByProject([{ id: "a", key: "elsewhere" }], ["alpha"], keyOf);
    expect(groups.at(-1)?.items.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("projectDotIndex", () => {
  it("should give a project the same colour every time", () => {
    expect(projectDotIndex("design")).toBe(projectDotIndex("design"));
  });

  it("should pick one of the eight series colours", () => {
    for (const key of ["a", "design", "research", "launch", "a very long project name", "日本"]) {
      const index = projectDotIndex(key);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(8);
    }
  });
});

describe("focusesSearch", () => {
  const press = { key: "/", metaKey: false, ctrlKey: false, altKey: false, typing: false, inOverlay: false };

  it("should focus the search when / is pressed outside a field", () => {
    expect(focusesSearch(press)).toBe(true);
  });

  it("should leave / alone while typing or with a modifier held", () => {
    expect(focusesSearch({ ...press, typing: true })).toBe(false);
    expect(focusesSearch({ ...press, metaKey: true })).toBe(false);
    expect(focusesSearch({ ...press, ctrlKey: true })).toBe(false);
    expect(focusesSearch({ ...press, key: "?" })).toBe(false);
  });

  it("should leave / to an open dialog, popover, menu, or list box", () => {
    expect(focusesSearch({ ...press, inOverlay: true })).toBe(false);
  });
});
