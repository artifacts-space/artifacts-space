import { describe, expect, it } from "vitest";

import { suggestionsFor, withTyped } from "./tag-suggestions";

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

describe("withTyped", () => {
  it("should add the normalized tag when it is new", () => {
    expect(withTyped(["infra"], " Q4 Launch ")).toEqual(["infra", "q4-launch"]);
  });

  it("should add nothing when the tag is empty or already there", () => {
    expect(withTyped(["infra"], " # ")).toBeNull();
    expect(withTyped(["infra"], "INFRA")).toBeNull();
  });
});
