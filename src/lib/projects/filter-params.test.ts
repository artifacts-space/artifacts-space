import { describe, expect, it } from "vitest";

import { parseProjectFilter, parseTagFilter, projectFilterId, workspaceQuery } from "./filter-params";

describe("parseProjectFilter", () => {
  it("should read a project key in lowercase when the URL names a project", () => {
    expect(parseProjectFilter({ project: "  Billing   V2 " })).toEqual({ key: "billing v2" });
  });

  it("should read no project when noproject is 1", () => {
    expect(parseProjectFilter({ noproject: "1", project: "billing" })).toEqual({ none: true });
  });

  it("should return null for all projects when the URL names none", () => {
    expect(parseProjectFilter({})).toBeNull();
    expect(parseProjectFilter({ project: "   " })).toBeNull();
  });

  it("should take the first value when a parameter repeats", () => {
    expect(parseProjectFilter({ project: ["a", "b"] })).toEqual({ key: "a" });
  });
});

describe("workspaceQuery", () => {
  it("should keep the team and add the project when both are set", () => {
    expect(workspaceQuery("acme", { key: "billing v2" })).toBe("?team=acme&project=billing+v2");
  });

  it("should return an empty string when nothing is set", () => {
    expect(workspaceQuery(null, null)).toBe("");
  });

  it("should ask for no project with noproject=1", () => {
    expect(workspaceQuery(null, { none: true })).toBe("?noproject=1");
  });
});

describe("projectFilterId", () => {
  it("should tell all, none, and one project apart", () => {
    expect(new Set([projectFilterId(null), projectFilterId({ none: true }), projectFilterId({ key: "none" })]).size).toBe(3);
  });
});

describe("parseTagFilter", () => {
  it("should normalize repeated tag params and drop repeats and empty ones", () => {
    expect(parseTagFilter({ tag: ["Launch", "launch", " # ", "Q4 Plan"] })).toEqual(["launch", "q4-plan"]);
  });

  it("should accept a single tag param and ignore one past the length limit", () => {
    expect(parseTagFilter({ tag: "infra" })).toEqual(["infra"]);
    expect(parseTagFilter({ tag: "x".repeat(200) })).toEqual([]);
  });
});

describe("workspaceQuery with tags", () => {
  it("should repeat the tag param after the scope and project", () => {
    expect(workspaceQuery("acme", { key: "billing" }, ["launch", "q4"])).toBe("?team=acme&project=billing&tag=launch&tag=q4");
  });
});
