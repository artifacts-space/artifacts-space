import { describe, expect, it } from "vitest";

import { templateFrameWidths } from "../../src/lib/ui/templates/frames";
import type { TemplateViewport } from "../../src/lib/ui/templates/types";

import { drawnMoreThan, endFrames, mostOf, readingPlan, unreachableIn, widthProblems } from "./template-readings";

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

/** A template in small: only what the reading helpers read from one. */
const fake = (viewport: TemplateViewport) => ({ id: `navbar-${viewport}`, viewport });

describe("readingPlan", () => {
  it("should read a fluid template in its three frames, and in the tablet frame made 640 wide", () => {
    const plan = readingPlan(fake("fluid").viewport);
    expect(plan.frames).toEqual([1440, 768, 390]);
    expect(plan.reads).toEqual([{ width: 1440, frame: 1440 }, { width: 768, frame: 768 }, { width: 640, frame: 768 }, { width: 390, frame: 390 }]);
    expect(endFrames(plan)).toEqual([1440, 390]);
  });

  it("should read a wide template in the two frames the page draws, and never below its tablet frame", () => {
    const plan = readingPlan(fake("wide").viewport);
    expect(plan.reads).toEqual([{ width: 1440, frame: 1440 }, { width: 768, frame: 768 }]);
    expect(endFrames(plan)).toEqual([1440, 768]);
  });

  it("should read a phone template once, in the one frame the page draws, and press there once", () => {
    const plan = readingPlan(fake("phone").viewport);
    expect(plan.reads).toEqual([{ width: 390, frame: 390 }]);
    expect(endFrames(plan)).toEqual([390]);
  });

  it("should read every viewport only in frames the page draws for it, starting at the widest", () => {
    for (const [viewport, drawn] of Object.entries(templateFrameWidths) as [TemplateViewport, readonly number[]][]) {
      const plan = readingPlan(viewport);
      expect(plan.frames, viewport).toEqual([...drawn].sort((a, b) => b - a));
      expect(plan.reads.every((read) => drawn.includes(read.frame) && read.width <= read.frame), viewport).toBe(true);
      expect(plan.reads[0], viewport).toEqual({ width: Math.max(...drawn), frame: Math.max(...drawn) });
    }
  });
});

describe("widthProblems", () => {
  const menu = counts({ Pricing: 1, "Open menu": 0 });

  it("should compare nothing for a phone template, and still fail when its one frame was not read", () => {
    const plan = readingPlan(fake("phone").viewport);
    expect(widthProblems(plan, new Map([[390, counts({ Pricing: 0, "Open menu": 2 })]]))).toEqual([]);
    expect(widthProblems(plan, new Map())).toEqual(["not read at 390"]);
  });

  it("should name a link a wide template loses in its tablet frame, and look for nothing drawn twice when there is no middle", () => {
    const plan = readingPlan(fake("wide").viewport);
    expect(widthProblems(plan, new Map([[1440, menu], [768, counts({ Pricing: 0, "Open menu": 1 })]]))).toEqual(['at 768, a reader cannot reach "Pricing", at rest or after opening a panel']);
    expect(widthProblems(plan, new Map([[1440, menu], [768, counts({ Pricing: 2, "Open menu": 0 })]]))).toEqual([]);
  });

  it("should fail a wide template when its tablet frame was not read", () => {
    expect(widthProblems(readingPlan(fake("wide").viewport), new Map([[1440, menu]]))).toEqual(["not read at 768"]);
  });

  it("should name what a fluid template loses when narrow and draws twice between its ends, and leave out an allowed label", () => {
    const plan = readingPlan(fake("fluid").viewport);
    const readings = new Map([[1440, menu], [768, counts({ Pricing: 2, "Open menu": 1 })], [640, counts({ Pricing: 1, "Open menu": 1 })], [390, counts({ Pricing: 0, "Open menu": 1 })]]);
    expect(widthProblems(plan, readings)).toEqual(['at 390, a reader cannot reach "Pricing", at rest or after opening a panel', 'at 768, drawn more often than at 390 or 1440: "Pricing" (2 times)']);
    expect(widthProblems(plan, readings, { Pricing: "shown on wide frames only, on purpose" })).toEqual(['at 768, drawn more often than at 390 or 1440: "Pricing" (2 times)']);
  });

  it("should find nothing wrong when every narrower reading reaches what the widest does", () => {
    const plan = readingPlan(fake("fluid").viewport);
    expect(widthProblems(plan, new Map(plan.reads.map((read) => [read.width, menu])))).toEqual([]);
  });
});
