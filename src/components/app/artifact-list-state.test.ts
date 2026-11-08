import { describe, expect, it } from "vitest";

import { artifactListState, filterArtifactList } from "./artifact-list-state";

describe("artifactListState", () => {
  it("should be empty when there are no artifacts at all", () => {
    expect(artifactListState({ total: 0, shown: 0 })).toBe("empty");
  });

  it("should report a mismatch when artifacts exist but filters hide them all", () => {
    expect(artifactListState({ total: 3, shown: 0 })).toBe("no-match");
  });

  it("should show items when at least one artifact matches", () => {
    expect(artifactListState({ total: 3, shown: 1 })).toBe("items");
  });
});

describe("filterArtifactList", () => {
  const noTags: string[] = [];
  const item = (id: string, overrides: Partial<{ kind: string; title: string; preview: string; tags: string[] }> = {}) => ({
    id, kind: "markdown", title: `Title ${id}`, summary: "", preview: "", project: null, tags: noTags, source: "", ...overrides,
  });
  const items = [item("a", { preview: "deploy notes" }), item("b", { kind: "ui" }), item("c")];

  it("should keep everything when there is no search and every format is shown", () => {
    expect(filterArtifactList(items, { query: "", kind: "all" }, null)).toEqual(items);
  });

  it("should match the preview locally when the search is in an artifact's opening text", () => {
    expect(filterArtifactList(items, { query: "DEPLOY", kind: "all" }, null).map((x) => x.id)).toEqual(["a"]);
  });

  it("should match a tag locally when the search names one", () => {
    const tagged = [...items, item("t", { tags: ["needs-review"] })];
    expect(filterArtifactList(tagged, { query: "needs-rev", kind: "all" }, null).map((x) => x.id)).toEqual(["t"]);
  });

  it("should add server matches after local ones when content further down matches", () => {
    const server = [item("c"), item("z")];
    expect(filterArtifactList(items, { query: "deploy", kind: "all" }, server).map((x) => x.id)).toEqual(["a", "c", "z"]);
  });

  it("should apply the format filter to server matches too", () => {
    expect(filterArtifactList(items, { query: "x", kind: "ui" }, [item("b", { kind: "ui" }), item("c")]).map((x) => x.id)).toEqual(["b"]);
  });
});
