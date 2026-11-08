import { describe, expect, it } from "vitest";

import { suggestionsFor, typedTags } from "./tag-suggestions";

const scope = [
  { tag: "launch", count: 9 },
  { tag: "needs-review", count: 5 },
  { tag: "q4-launch", count: 3 },
  { tag: "infra", count: 1 },
];

describe("suggestionsFor", () => {
  it("should put tags that start with the typed text before ones that only contain it", () => {
    expect(suggestionsFor(scope, "laun", [])).toEqual(["launch", "q4-launch"]);
  });

  it("should leave out tags the artifact already has", () => {
    expect(suggestionsFor(scope, "", ["launch"])).toEqual(["needs-review", "q4-launch", "infra"]);
  });

  it("should match typed words the way tags are stored when the text has spaces and capitals", () => {
    expect(suggestionsFor(scope, "Needs Rev", [])).toEqual(["needs-review"]);
  });
});

describe("typedTags", () => {
  it("should add one tag per comma-separated part when text is pasted", () => {
    expect(typedTags(["infra"], "a, B c, infra, a")).toEqual({ add: ["a", "b-c"] });
  });

  it("should add nothing when the text is empty or every tag is already there", () => {
    expect(typedTags(["infra"], " # ")).toEqual({ add: [] });
    expect(typedTags(["infra"], "INFRA")).toEqual({ add: [] });
  });

  it("should give a message instead when a part is too long", () => {
    expect(typedTags([], `ok, ${"x".repeat(40)}`)).toEqual({ error: "Tags are 1 to 32 characters." });
  });
});
