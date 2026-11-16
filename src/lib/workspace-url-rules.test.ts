import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";

import { toArtifactListItem } from "./artifact-preview";
import { addressStep, namedArtifact, searchNaming, selectionUrlWrite } from "./workspace-url-rules";

describe("namedArtifact", () => {
  it("should read the artifact when the query names one among other params", () => {
    expect(namedArtifact("?team=core&artifact=abc&comments=1")).toBe("abc");
  });

  it("should find none when the query names none, repeats it, or names a malformed id", () => {
    expect(namedArtifact("")).toBeNull();
    expect(namedArtifact("?team=core")).toBeNull();
    expect(namedArtifact("?artifact=a&artifact=b")).toBeNull();
    expect(namedArtifact("?artifact=../x")).toBeNull();
  });
});

describe("searchNaming", () => {
  it("should add the artifact after the other params when the query names none", () => {
    expect(searchNaming("?team=core", "abc")).toBe("?team=core&artifact=abc");
    expect(searchNaming("", "abc")).toBe("?artifact=abc");
  });

  it("should replace the artifact in place when the query names another", () => {
    expect(searchNaming("?artifact=old&team=core", "abc")).toBe("?artifact=abc&team=core");
  });

  it("should drop a link's comment params when it writes", () => {
    expect(searchNaming("?artifact=abc&comments=1", "abc")).toBe("?artifact=abc");
    expect(searchNaming("?artifact=abc&comment=c-1&team=core", "abc")).toBe("?artifact=abc&team=core");
  });

  it("should drop the artifact and the comment params when nothing is named", () => {
    expect(searchNaming("?team=core&artifact=abc&comments=1", null)).toBe("?team=core");
    expect(searchNaming("?artifact=abc&comment=c-1", null)).toBe("");
  });
});

describe("selectionUrlWrite", () => {
  it("should push the artifact when the person opens another one", () => {
    expect(selectionUrlWrite("?artifact=a", "b", "push")).toEqual({ mode: "push", search: "?artifact=b" });
  });

  it("should push the artifact when the person opens one from plain /app", () => {
    expect(selectionUrlWrite("?project=design", "b", "push")).toEqual({ mode: "push", search: "?project=design&artifact=b" });
  });

  it("should write nothing when the person picks the artifact the URL already names", () => {
    expect(selectionUrlWrite("?artifact=b", "b", "push")).toBeNull();
  });

  it("should write nothing when a link or Back already put the artifact in the URL", () => {
    expect(selectionUrlWrite("?artifact=b", "b", null)).toBeNull();
  });

  it("should replace with plain /app when the workspace falls back after a delete", () => {
    expect(selectionUrlWrite("?team=core&artifact=gone", "next", "clear")).toEqual({ mode: "replace", search: "?team=core" });
  });

  it("should replace with plain /app when the open artifact changed without a pick and the URL names another", () => {
    expect(selectionUrlWrite("?artifact=a", "b", null)).toEqual({ mode: "replace", search: "" });
  });

  it("should replace with plain /app when nothing is open any more", () => {
    expect(selectionUrlWrite("?artifact=a", null, "push")).toEqual({ mode: "replace", search: "" });
    expect(selectionUrlWrite("?artifact=a", null, null)).toEqual({ mode: "replace", search: "" });
  });

  it("should write nothing when plain /app falls back with nothing named", () => {
    expect(selectionUrlWrite("", "next", "clear")).toBeNull();
    expect(selectionUrlWrite("?", null, null)).toBeNull();
  });
});

describe("addressStep", () => {
  const item = (id: string) => toArtifactListItem(fixtureArtifact({ id, kind: "text", title: id, content: id, publicId: `pub${id}` }));
  const list = [item("a"), item("b")];
  const base = { artifacts: list, target: null, failed: false, plainShown: null, deleted: new Set<string>() };

  it("should open the listed artifact when the address names one in the list", () => {
    expect(addressStep({ ...base, link: { publicId: "pubb", comments: false } })).toEqual({ kind: "open", artifacts: list, selectedId: "b", publicId: "pubb" });
  });

  it("should pin the server's copy when the address names one outside the list that the server found", () => {
    const outside = item("c");
    expect(addressStep({ ...base, link: { publicId: "pubc", comments: true }, target: outside })).toEqual({ kind: "open", artifacts: [outside, ...list], selectedId: "c", publicId: "pubc" });
  });

  it("should load the artifact when the address names one neither the list nor the server's answer holds", () => {
    expect(addressStep({ ...base, link: { publicId: "pubc", comments: false }, target: item("d") })).toEqual({ kind: "load", publicId: "pubc" });
  });

  it("should load, not revive the server's copy, when the address names an artifact deleted in this visit", () => {
    expect(addressStep({ ...base, link: { publicId: "pubc", comments: false }, target: item("c"), deleted: new Set(["c"]) })).toEqual({ kind: "load", publicId: "pubc" });
  });

  it("should report a failed check when the server could not check the link", () => {
    expect(addressStep({ ...base, link: { publicId: "pubc", comments: false }, failed: true })).toEqual({ kind: "failed" });
  });

  it("should open what plain /app showed when the address is plain /app and the list still holds it", () => {
    expect(addressStep({ ...base, link: null, plainShown: "pubb" })).toMatchObject({ kind: "open", selectedId: "b" });
  });

  it("should open the first artifact when the address is plain /app and what it showed is gone", () => {
    expect(addressStep({ ...base, link: null, plainShown: "pubgone" })).toMatchObject({ kind: "open", selectedId: "a" });
    expect(addressStep({ ...base, link: null })).toMatchObject({ kind: "open", selectedId: "a" });
  });

  it("should open nothing when the address is plain /app and the list is empty", () => {
    expect(addressStep({ ...base, artifacts: [], link: null, plainShown: "pubb" })).toEqual({ kind: "none" });
  });
});
