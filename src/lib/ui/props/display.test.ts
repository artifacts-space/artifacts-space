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

describe("Grid spans", () => {
  const grid = (props: Record<string, unknown>, children: number) => validateUiSpec({
    version: 1,
    root: "g",
    state: { n: 3 },
    elements: { g: { type: "Grid", props, children: Array.from({ length: children }, (_, index) => `c${String(index)}`) }, ...Object.fromEntries(Array.from({ length: children }, (_, index) => [`c${String(index)}`, { type: "Text", props: { text: "Cell" } }])) },
  }).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);

  it("should accept one span per child up to columns, and a grid with no spans", () => {
    expect(grid({ columns: 3, spans: [2, 1, 1] }, 3)).toEqual([]);
    expect(grid({ columns: 3 }, 3)).toEqual([]);
  });

  it("should refuse a different number of spans and children, in the shape of the other paired props", () => {
    expect(grid({ columns: 3, spans: [2, 1] }, 3)).toEqual(['Element "g" (Grid): 2 spans but 3 children. Give exactly one child per entry in spans; entry N is how many columns child N spans.']);
  });

  it("should refuse a span wider than columns, and name each one", () => {
    expect(grid({ columns: 2, spans: [3, 1, 4] }, 3)).toEqual([expect.stringContaining("`spans` #1 (3), #3 (4) are more than `columns` (2)")]);
    expect(grid({ spans: [3] }, 1)).toEqual([expect.stringContaining("more than `columns` (2)")]);
  });

  it("should refuse spans on a Grid that repeats its child once per item", () => {
    const found = validateUiSpec({ version: 1, root: "g", state: { items: [{ id: "a" }] }, elements: { g: { type: "Grid", props: { spans: [2] }, repeat: { statePath: "/items", key: "id" }, children: ["c"] }, c: { type: "Text", props: { text: "Cell" } } } }).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
    expect(found).toEqual([expect.stringContaining("a Grid with `repeat` draws its child once per item")]);
  });

  it("should say nothing about the spans while columns is read from state", () => {
    expect(grid({ columns: { $state: "/n" }, spans: [3, 1, 1] }, 3)).toEqual([]);
  });
});

describe("Badge dot alone", () => {
  it("should refuse an icon or a variant on a dot alone, and name what to remove", () => {
    expect(errors("Badge", { label: "Unread", dot: "only", icon: "check" })).toEqual([expect.stringContaining("`icon` styles a badge with its label on screen")]);
    expect(errors("Badge", { label: "Unread", dot: "only", icon: "check", variant: "solid" })).toEqual([expect.stringContaining("`icon` and `variant` style a badge")]);
  });

  it("should accept an icon and a variant beside a dot at the start", () => {
    expect(errors("Badge", { label: "Live", dot: "start", icon: "check", variant: "solid" })).toEqual([]);
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
