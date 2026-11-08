import { describe, expect, it } from "vitest";

import {
  afterRowCreated,
  afterRowDeleted,
  afterRowRenamed,
  countsFromFacets,
  homeSpaceOf,
  moveTarget,
  deleteProjectCopy,
  matchesProjectFilter,
  shiftCount,
  sidebarProjects,
  toSidebarRows,
  type SidebarProjectRow,
  type SidebarProjectsState,
} from "./sidebar-rules";

const acme = { slug: "acme", name: "Acme" };
const own = (id: string, name: string): SidebarProjectRow => ({ id, name, icon: null, team: null });
const teamRow = (id: string, name: string): SidebarProjectRow => ({ id, name, icon: "🚀", team: acme });

function state(rows: SidebarProjectRow[], byKey: Record<string, number>, none = 0): SidebarProjectsState {
  return { rows, counts: { byKey, none } };
}

describe("sidebarProjects", () => {
  it("should merge rows with the same name key into one entry when a team shares the name", () => {
    const entries = sidebarProjects([teamRow("t1", "DESIGN"), own("o1", "Design")], { byKey: { design: 3 }, none: 0 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: "design", name: "Design", icon: null, count: 3 });
    expect(entries[0]?.rows.map((row) => row.id)).toEqual(["t1", "o1"]);
  });

  it("should keep empty projects and sort by name when counts are missing", () => {
    const entries = sidebarProjects([own("b", "beta"), own("a", "Alpha")], { byKey: {}, none: 2 });
    expect(entries.map((entry) => [entry.name, entry.count])).toEqual([["Alpha", 0], ["beta", 0]]);
  });
});

describe("shiftCount", () => {
  const counts = countsFromFacets({ projects: [{ key: "design", count: 2 }], none: 1 });

  it("should move one artifact from No project into a project when it is dropped there", () => {
    expect(shiftCount(counts, null, "design")).toEqual({ byKey: { design: 3 }, none: 0 });
  });

  it("should move one artifact back to No project when it leaves a project", () => {
    expect(shiftCount(counts, "design", null)).toEqual({ byKey: { design: 1 }, none: 2 });
  });

  it("should change nothing when the artifact stays where it was", () => {
    expect(shiftCount(counts, "design", "design")).toBe(counts);
  });

  it("should never count below zero when the counts are stale", () => {
    expect(shiftCount({ byKey: {}, none: 0 }, "gone", null)).toEqual({ byKey: { gone: 0 }, none: 1 });
  });
});

describe("afterRowDeleted", () => {
  it("should move the project's artifacts to No project when it was the only row with that name", () => {
    expect(afterRowDeleted(state([own("o1", "Design")], { design: 2 }, 1), "o1")).toEqual(state([], {}, 3));
  });

  it("should keep the entry's count when a team project keeps the name", () => {
    const next = afterRowDeleted(state([own("o1", "Design"), teamRow("t1", "Design")], { design: 2 }), "o1");
    expect(next).toEqual(state([teamRow("t1", "Design")], { design: 2 }));
  });

  it("should change nothing when the row is unknown", () => {
    const current = state([own("o1", "Design")], { design: 2 });
    expect(afterRowDeleted(current, "missing")).toBe(current);
  });
});

describe("afterRowRenamed", () => {
  it("should carry the count to the new name when the row is renamed", () => {
    expect(afterRowRenamed(state([own("o1", "Design")], { design: 2 }), "o1", "Specs")).toEqual(state([own("o1", "Specs")], { specs: 2 }));
  });

  it("should keep the count when only the letter case changes", () => {
    expect(afterRowRenamed(state([own("o1", "design")], { design: 2 }), "o1", "Design").counts.byKey).toEqual({ design: 2 });
  });
});

describe("afterRowCreated", () => {
  it("should add a new row once when it is created twice", () => {
    const once = afterRowCreated(state([], {}), own("o1", "Design"));
    expect(afterRowCreated(once, own("o1", "Design")).rows).toHaveLength(1);
  });
});

describe("matchesProjectFilter", () => {
  it("should match by name key when a project filter is on", () => {
    expect(matchesProjectFilter({ name: "Design" }, { key: "design" })).toBe(true);
    expect(matchesProjectFilter({ name: "Specs" }, { key: "design" })).toBe(false);
    expect(matchesProjectFilter(null, { key: "design" })).toBe(false);
  });

  it("should match only artifacts without a project when No project is on", () => {
    expect(matchesProjectFilter(null, { none: true })).toBe(true);
    expect(matchesProjectFilter({ name: "Design" }, { none: true })).toBe(false);
  });
});

describe("deleteProjectCopy", () => {
  it("should name the team and say the artifacts stay when a team project is deleted", () => {
    expect(deleteProjectCopy(teamRow("t1", "Launch"), 1)).toBe("“Launch” goes away from Acme. Its 1 artifact stays and just leaves the project.");
  });
});

describe("toSidebarRows", () => {
  const teams = [{ id: "acme", slug: "acme", name: "Acme", personal: false }, { id: "me", slug: "me", name: "Me", personal: true }];

  it("should name the team of a team project and leave the viewer's own unnamed", () => {
    const rows = toSidebarRows([{ id: "o1", name: "Design", icon: null, teamId: null }, { id: "t1", name: "Launch", icon: null, teamId: "acme" }], teams);
    expect(rows).toEqual([own("o1", "Design"), { id: "t1", name: "Launch", icon: null, team: acme }]);
  });

  it("should leave out a row when its team is not one of the viewer's shared teams", () => {
    expect(toSidebarRows([{ id: "x", name: "Secret", icon: null, teamId: "other" }, { id: "p", name: "Personal", icon: null, teamId: "me" }], teams)).toEqual([]);
  });
});

describe("homeSpaceOf", () => {
  const teams = [{ id: "acme", slug: "acme", name: "Acme", personal: false }, { id: "me", slug: "me", name: "Me", personal: true }];

  it("should be the viewer's own space when the artifact is private", () => {
    expect(homeSpaceOf({ authorId: "viewer", visibility: "private", teamId: "acme" }, teams, "viewer")).toEqual({ kind: "own" });
  });

  it("should be the team when the artifact is shared through a shared team", () => {
    expect(homeSpaceOf({ authorId: "viewer", visibility: "team", teamId: "acme" }, teams, "viewer")).toEqual({ kind: "team", slug: "acme", name: "Acme" });
  });

  it("should be the author's own space when the artifact is shared through a personal team", () => {
    expect(homeSpaceOf({ authorId: "viewer", visibility: "link", teamId: "me" }, teams, "viewer")).toEqual({ kind: "own" });
  });

  it("should be another person's space when someone else wrote a private artifact", () => {
    expect(homeSpaceOf({ authorId: "someone", visibility: "private", teamId: null }, teams, "viewer")).toEqual({ kind: "other" });
  });

  it("should match no rows when the artifact's team is not one of the viewer's", () => {
    const home = homeSpaceOf({ authorId: "viewer", visibility: "team", teamId: "globex" }, teams, "viewer");
    expect(moveTarget({ key: "launch", name: "Launch", icon: null, count: 0, rows: [teamRow("t1", "Launch")] }, home)).toHaveProperty("refusal");
  });
});

describe("moveTarget", () => {
  const merged = { key: "design", name: "Design", icon: null, count: 0, rows: [teamRow("t1", "Design"), own("o1", "Design")] };

  it("should pick the row in the artifact's own space when a name exists in several spaces", () => {
    expect(moveTarget(merged, { kind: "own" })).toEqual({ row: own("o1", "Design") });
    expect(moveTarget(merged, { kind: "team", slug: "acme", name: "Acme" })).toEqual({ row: teamRow("t1", "Design") });
  });

  it("should refuse and say to share first when a private artifact goes to a team-only project", () => {
    const launch = { key: "launch", name: "Launch", icon: null, count: 0, rows: [teamRow("t1", "Launch")] };
    expect(moveTarget(launch, { kind: "own" })).toEqual({ refusal: "Share it with Acme first to put it in Launch." });
  });

  it("should refuse and say to stop sharing first when a team artifact goes to the viewer's own project", () => {
    const research = { key: "research", name: "Research", icon: null, count: 0, rows: [own("o1", "Research")] };
    expect(moveTarget(research, { kind: "team", slug: "acme", name: "Acme" })).toEqual({ refusal: "Stop sharing it with Acme first to put it in Research." });
  });
});
