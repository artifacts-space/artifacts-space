import { describe, expect, it } from "vitest";

import { componentFixtures, fixtureSpec } from "../fixtures/components";
import { validateUiSpec } from "../validate";

function issues(type: string, props: Record<string, unknown>) {
  return validateUiSpec({ version: 1, root: "e", state: { n: 3 }, elements: { e: { type, props } } }).issues;
}

const errors = (type: string, props: Record<string, unknown>) => issues(type, props).filter((issue) => issue.severity === "error").map((issue) => issue.message);

describe("AvatarGroup props", () => {
  it("should accept people with optional initials and tones, a max, a total, and a size", () => {
    expect(errors("AvatarGroup", { people: [{ name: "Maya Chen", initials: "MC", tone: "info" }, { name: "Omar Haddad" }], max: 1, total: 12, size: "lg" })).toEqual([]);
  });

  it("should refuse an empty list, initials longer than three letters, and a max past ten", () => {
    expect(errors("AvatarGroup", { people: [] })).not.toEqual([]);
    expect(errors("AvatarGroup", { people: [{ name: "Maya", initials: "MAYA" }] })).not.toEqual([]);
    expect(errors("AvatarGroup", { people: [{ name: "Maya" }], max: 11 })).not.toEqual([]);
  });

  it("should refuse a total smaller than the people listed, and say so", () => {
    const found = errors("AvatarGroup", { people: [{ name: "A" }, { name: "B" }, { name: "C" }], total: 2 });
    expect(found).toEqual([expect.stringContaining("cannot be less than the 3 people listed")]);
  });
});

describe("Kbd props", () => {
  it("should accept one to six keys and refuse none, seven, or an empty key", () => {
    expect(errors("Kbd", { keys: ["⌘", "K"] })).toEqual([]);
    expect(errors("Kbd", { keys: [] })).not.toEqual([]);
    expect(errors("Kbd", { keys: ["1", "2", "3", "4", "5", "6", "7"] })).not.toEqual([]);
    expect(errors("Kbd", { keys: [" "] })).not.toEqual([]);
  });
});

describe("Rating props", () => {
  it("should accept whole and half stars up to max", () => {
    expect(errors("Rating", { value: 4.5 })).toEqual([]);
    expect(errors("Rating", { value: 10, max: 10, label: "Score", showValue: true, size: "lg" })).toEqual([]);
  });

  it("should refuse a value past max, and a value that is not a whole or half star", () => {
    expect(errors("Rating", { value: 6 })).toEqual([expect.stringContaining("more than `max` (5)")]);
    expect(errors("Rating", { value: 4.3 })).toEqual([expect.stringContaining("whole or half star")]);
  });

  it("should say nothing about the score while value is read from state", () => {
    expect(errors("Rating", { value: { $state: "/n" } })).toEqual([]);
  });
});

describe("Badge dot", () => {
  it("should accept a dot at the start or alone, and refuse any other place", () => {
    expect(errors("Badge", { label: "Online", dot: "start" })).toEqual([]);
    expect(errors("Badge", { label: "Unread", dot: "only" })).toEqual([]);
    expect(errors("Badge", { label: "Unread", dot: "end" })).not.toEqual([]);
  });
});

describe("Grid narrowColumns", () => {
  it("should accept one or two narrow columns up to columns, and refuse more than columns", () => {
    expect(errors("Grid", { columns: 4, narrowColumns: 2 })).toEqual([]);
    expect(errors("Grid", { narrowColumns: 2 })).toEqual([]);
    expect(errors("Grid", { columns: 1, narrowColumns: 2 })).toEqual([expect.stringContaining("never shows more columns than a wide one")]);
    expect(errors("Grid", { columns: 4, narrowColumns: 3 })).not.toEqual([]);
  });
});

describe("display fixtures", () => {
  it.each(["AvatarGroup", "Kbd", "Rating", "Badge", "Input"] as const)("should validate every %s fixture with no errors or warnings", (type) => {
    for (const fixture of componentFixtures[type]) {
      if (fixture.name === "Long") continue;
      expect(validateUiSpec(fixtureSpec(type, fixture)).issues, fixture.name).toEqual([]);
    }
  });
});
