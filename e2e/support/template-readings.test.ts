import { describe, expect, it } from "vitest";

import { drawnMoreThan, mostOf, unreachableIn } from "./template-readings";

const counts = (actions: Record<string, number>, pictures: Record<string, number> = {}) => ({ actions, pictures });

describe("mostOf", () => {
  it("should keep the highest count of each label when a frame is read in several states", () => {
    expect(mostOf([counts({ Pricing: 0, "Open menu": 1 }), counts({ Pricing: 1, "Open menu": 0 })])).toEqual(counts({ Pricing: 1, "Open menu": 1 }));
  });
});

describe("unreachableIn", () => {
  it("should name a link the wide frame shows and the narrow frame never does", () => {
    expect(unreachableIn(counts({ Pricing: 0, Docs: 1 }), counts({ Pricing: 1, Docs: 1 }))).toEqual(["Pricing"]);
  });

  it("should accept a link the narrow frame shows only with a panel open, and one the wide frame never shows", () => {
    const narrow = mostOf([counts({ Pricing: 0, "Open menu": 1 }), counts({ Pricing: 1, "Open menu": 0 })]);
    expect(unreachableIn(narrow, counts({ Pricing: 1, "Open menu": 0 }))).toEqual([]);
  });

  it("should leave out a label that is allowed with a reason, and only that one", () => {
    expect(unreachableIn(counts({ Product: 0, Pricing: 0 }), counts({ Product: 1, Pricing: 1 }), { Product: "it only opens the panel" })).toEqual(["Pricing"]);
  });
});

describe("drawnMoreThan", () => {
  it("should name a link drawn twice between two steps and once at both ends", () => {
    expect(drawnMoreThan(counts({ "Sign in": 2, Pricing: 1 }), [counts({ "Sign in": 1, Pricing: 1 }), counts({ "Sign in": 1, Pricing: 1 })])).toEqual(['"Sign in" (2 times)']);
  });

  it("should accept a label drawn as often at one end, such as a link repeated in every card", () => {
    expect(drawnMoreThan(counts({ "Read more": 3 }), [counts({ "Read more": 3 }), counts({ "Read more": 1 })])).toEqual([]);
  });

  it("should name a picture drawn twice, and a label an end never draws at all", () => {
    expect(drawnMoreThan(counts({}, { "Day view": 2 }), [counts({}, { "Day view": 1 })])).toEqual(['"Day view" (2 times)']);
    expect(drawnMoreThan(counts({ Menu: 1 }), [counts({}), counts({})])).toEqual(['"Menu" (once)']);
  });
});
