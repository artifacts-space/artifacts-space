import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";

import { linkedStart, linkNotice, openArtifactLink } from "./app-link-rules";
import { toArtifactListItem } from "./artifact-preview";

const item = (id: string) => toArtifactListItem(fixtureArtifact({ id, kind: "text", title: id, content: id, publicId: `pub${id}` }));
const list = [item("a"), item("b")];

describe("openArtifactLink", () => {
  it("should select the listed artifact and keep the list when the link points into the list", () => {
    expect(openArtifactLink(list, { publicId: "pubb", comments: true }, null)).toEqual({ kind: "open", artifacts: list, selectedId: "b" });
  });

  it("should pin the server's copy to the top when the artifact is outside the list", () => {
    const outside = item("c");
    const outcome = openArtifactLink(list, { publicId: "pubc", comments: false }, outside);
    expect(outcome).toEqual({ kind: "open", artifacts: [outside, ...list], selectedId: "c" });
  });

  it("should keep the list's copy when the server also found the artifact", () => {
    const fresher = { ...item("b"), title: "Server copy" };
    const outcome = openArtifactLink(list, { publicId: "pubb", comments: false }, fresher);
    expect(outcome.kind === "open" ? outcome.artifacts : null).toBe(list);
  });

  it("should report the artifact unavailable when the server found nothing for the link", () => {
    expect(openArtifactLink(list, { publicId: "pubgone", comments: true }, null)).toEqual({ kind: "unavailable" });
  });

  it("should not open a target that belongs to another link", () => {
    expect(openArtifactLink(list, { publicId: "pubgone", comments: false }, item("c"))).toEqual({ kind: "unavailable" });
  });
});

describe("linkedStart", () => {
  it("should start on the first artifact when there is no link", () => {
    expect(linkedStart(list, null, null)).toEqual({ artifacts: list, selectedId: "a", unavailable: false, opened: null });
  });

  it("should start on the linked artifact and remember the link when it opens", () => {
    const link = { publicId: "pubb", comments: true };
    expect(linkedStart(list, link, null)).toEqual({ artifacts: list, selectedId: "b", unavailable: false, opened: link });
  });

  it("should start on the first artifact and flag the link when its artifact is unavailable", () => {
    expect(linkedStart(list, { publicId: "pubgone", comments: false }, null)).toEqual({ artifacts: list, selectedId: "a", unavailable: true, opened: null });
  });

  it("should start empty when the list is empty and the link finds nothing", () => {
    expect(linkedStart([], { publicId: "pubgone", comments: false }, null).selectedId).toBe("");
  });
});

describe("linkNotice", () => {
  it("should say nothing when the link opened its artifact", () => {
    expect(linkNotice(false, false)).toBeNull();
    expect(linkNotice(false, true)).toBeNull();
  });

  it("should call the artifact gone when the server checked and found nothing", () => {
    expect(linkNotice(true, false)).toBe("gone");
  });

  it("should not call the artifact gone when the server could not check it", () => {
    expect(linkNotice(true, true)).toBe("failed");
  });
});
