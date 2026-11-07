import { describe, expect, it } from "vitest";

import { projectLimits } from "./limits";
import {
  artifactHomeScope,
  mergeProjectFacets,
  normalizeProjectIcon,
  normalizeProjectName,
  projectChoiceSchema,
  projectIconSchema,
  projectNameKey,
  projectNameSchema,
  sameScope,
  scopeIsFull,
  scopeOfRow,
} from "./rules";

describe("normalizeProjectName", () => {
  it("should trim and collapse inner spaces when a name has extra whitespace", () => {
    expect(normalizeProjectName("  Billing \t\n  v2  ")).toBe("Billing v2");
  });

  it("should drop control and invisible format characters when a name hides them", () => {
    expect(normalizeProjectName("Bil\u0000ling​‮")).toBe("Billing");
  });

  it("should compose accents into one form when they arrive decomposed", () => {
    expect(normalizeProjectName("Café")).toBe("Café");
  });
});

describe("projectNameKey", () => {
  it("should give the same key when names differ only in case and spacing", () => {
    expect(projectNameKey(" BILLING  v2")).toBe(projectNameKey("billing v2"));
  });

  it("should give different keys when names differ in letters", () => {
    expect(projectNameKey("Billing")).not.toBe(projectNameKey("Billings"));
  });
});

describe("artifactHomeScope", () => {
  const base = { userId: "author", teamId: "team-1" };

  it("should use the team when the artifact is shared through a shared team", () => {
    expect(artifactHomeScope({ ...base, visibility: "team" }, false)).toEqual({ kind: "team", teamId: "team-1" });
    expect(artifactHomeScope({ ...base, visibility: "link" }, false)).toEqual({ kind: "team", teamId: "team-1" });
  });

  it("should use the author when the artifact is private, even with a team id", () => {
    expect(artifactHomeScope({ ...base, visibility: "private" }, false)).toEqual({ kind: "user", userId: "author" });
  });

  it("should use the author when the team is someone's personal team", () => {
    expect(artifactHomeScope({ ...base, visibility: "public" }, true)).toEqual({ kind: "user", userId: "author" });
  });

  it("should use the author when the artifact names no team or the team is unknown", () => {
    expect(artifactHomeScope({ userId: "author", teamId: null, visibility: "link" }, null)).toEqual({ kind: "user", userId: "author" });
    expect(artifactHomeScope({ ...base, visibility: "team" }, null)).toEqual({ kind: "user", userId: "author" });
  });
});

describe("sameScope and scopeOfRow", () => {
  it("should match only the same person or the same team", () => {
    expect(sameScope({ kind: "user", userId: "a" }, { kind: "user", userId: "a" })).toBe(true);
    expect(sameScope({ kind: "user", userId: "a" }, { kind: "user", userId: "b" })).toBe(false);
    expect(sameScope({ kind: "team", teamId: "a" }, { kind: "user", userId: "a" })).toBe(false);
    expect(sameScope({ kind: "team", teamId: "t" }, { kind: "team", teamId: "t" })).toBe(true);
  });

  it("should refuse a row that names both or neither scope", () => {
    expect(scopeOfRow({ userId: "u", teamId: "t" })).toBeNull();
    expect(scopeOfRow({ userId: null, teamId: null })).toBeNull();
    expect(scopeOfRow({ userId: null, teamId: "t" })).toEqual({ kind: "team", teamId: "t" });
  });
});

describe("projectNameSchema", () => {
  it("should accept and normalize a name when it fits", () => {
    expect(projectNameSchema.parse("  Launch   plan ")).toBe("Launch plan");
  });

  it("should refuse an empty name when only spaces are sent", () => {
    expect(projectNameSchema.safeParse("   ").success).toBe(false);
  });

  it("should refuse a name when it is longer than the limit", () => {
    expect(projectNameSchema.safeParse("x".repeat(projectLimits.maxNameChars + 1)).success).toBe(false);
  });
});

describe("projectChoiceSchema", () => {
  it("should mean no project when the name is null, empty, or spaces", () => {
    expect(projectChoiceSchema.parse(null)).toBeNull();
    expect(projectChoiceSchema.parse("")).toBeNull();
    expect(projectChoiceSchema.parse("  ")).toBeNull();
  });

  it("should return the normalized name when one is sent", () => {
    expect(projectChoiceSchema.parse(" billing ")).toBe("billing");
  });
});

describe("normalizeProjectIcon", () => {
  it("should accept one emoji or an allowed Tabler icon", () => {
    expect(normalizeProjectIcon("🧾")).toBe("🧾");
    expect(normalizeProjectIcon("tabler:rocket")).toBe("tabler:rocket");
  });

  it("should refuse an uploaded image when a project icon is set", () => {
    expect(normalizeProjectIcon("file:0b6b3c1e-1f0a-4c3b-9a43-2d5e8f7a6b1c")).toBeUndefined();
    expect(projectIconSchema.safeParse("file:0b6b3c1e-1f0a-4c3b-9a43-2d5e8f7a6b1c").success).toBe(false);
  });

  it("should refuse text and markup when they are not an icon", () => {
    expect(normalizeProjectIcon("<b>hi</b>")).toBeUndefined();
    expect(normalizeProjectIcon("tabler:not-a-real-icon")).toBeUndefined();
  });

  it("should remove the icon when null or an empty string is sent", () => {
    expect(normalizeProjectIcon(null)).toBeNull();
    expect(projectIconSchema.parse("")).toBeNull();
  });
});

describe("scopeIsFull", () => {
  it("should be full only at the runaway cap", () => {
    expect(scopeIsFull(projectLimits.maxPerScope - 1)).toBe(false);
    expect(scopeIsFull(projectLimits.maxPerScope)).toBe(true);
  });
});

describe("mergeProjectFacets", () => {
  it("should merge entries with one key and let the viewer's own project name them", () => {
    const facets = mergeProjectFacets([
      { id: "t", name: "BILLING", nameKey: "billing", icon: "tabler:users", own: false, count: 2 },
      { id: "u", name: "Billing", nameKey: "billing", icon: "🧾", own: true, count: 3 },
    ]);
    expect(facets).toEqual([{ key: "billing", name: "Billing", icon: "🧾", count: 5 }]);
  });

  it("should leave out empty projects and sort by name", () => {
    const facets = mergeProjectFacets([
      { id: "1", name: "zeta", nameKey: "zeta", icon: null, own: true, count: 1 },
      { id: "2", name: "Alpha", nameKey: "alpha", icon: null, own: true, count: 4 },
      { id: "3", name: "Empty", nameKey: "empty", icon: null, own: true, count: 0 },
    ]);
    expect(facets.map((facet) => facet.name)).toEqual(["Alpha", "zeta"]);
  });
});
