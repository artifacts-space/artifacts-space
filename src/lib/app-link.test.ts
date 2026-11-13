import { describe, expect, it } from "vitest";

import { artifactLinkHref, commentIdFromHash, parseArtifactLink, parseArtifactLinkSearch, withoutArtifactLink, withoutCommentHash } from "./app-link";

describe("parseArtifactLink", () => {
  it("should read the artifact and the comments flag when both are set", () => {
    expect(parseArtifactLink({ artifact: "4fXkP9qR2sT7vW1yZ3aB5c", comments: "1" })).toEqual({ publicId: "4fXkP9qR2sT7vW1yZ3aB5c", comments: true });
  });

  it("should leave comments closed when the flag is missing or not 1", () => {
    expect(parseArtifactLink({ artifact: "abc" })?.comments).toBe(false);
    expect(parseArtifactLink({ artifact: "abc", comments: "yes" })?.comments).toBe(false);
  });

  it("should ignore a missing, repeated, or malformed id", () => {
    expect(parseArtifactLink({})).toBeNull();
    expect(parseArtifactLink({ artifact: ["a", "b"] })).toBeNull();
    expect(parseArtifactLink({ artifact: "../teams" })).toBeNull();
    expect(parseArtifactLink({ artifact: "x".repeat(65) })).toBeNull();
  });

  it("should open the comments at one comment when the link names it", () => {
    expect(parseArtifactLink({ artifact: "abc", comment: "0b6f6a52-1c3e-4c1a-9f0e-2d7b8c9a1e2f" })).toEqual({ publicId: "abc", comments: true, commentId: "0b6f6a52-1c3e-4c1a-9f0e-2d7b8c9a1e2f" });
  });

  it("should ignore a malformed or repeated comment id when the artifact is fine", () => {
    expect(parseArtifactLink({ artifact: "abc", comment: "<script>" })).toEqual({ publicId: "abc", comments: false });
    expect(parseArtifactLink({ artifact: "abc", comment: ["c1", "c2"], comments: "1" })).toEqual({ publicId: "abc", comments: true });
  });
});

describe("artifactLinkHref", () => {
  it("should build the link that opens the comments when asked", () => {
    expect(artifactLinkHref({ publicId: "abc", comments: true })).toBe("/app?artifact=abc&comments=1");
    expect(artifactLinkHref({ publicId: "abc", comments: false })).toBe("/app?artifact=abc");
  });

  it("should name the comment when the link opens one", () => {
    expect(artifactLinkHref({ publicId: "abc", comments: true, commentId: "c-1" })).toBe("/app?artifact=abc&comment=c-1");
  });
});

describe("withoutArtifactLink", () => {
  it("should drop only the link params when other filters are set", () => {
    expect(withoutArtifactLink("?team=core&artifact=abc&comments=1")).toBe("?team=core");
    expect(withoutArtifactLink("?artifact=abc")).toBe("");
    expect(withoutArtifactLink("?artifact=abc&comment=c-1&team=core")).toBe("?team=core");
  });
});

describe("parseArtifactLinkSearch", () => {
  it("should read the link from a query string when it has one", () => {
    expect(parseArtifactLinkSearch(new URLSearchParams("?team=core&artifact=abc&comments=1"))).toEqual({ publicId: "abc", comments: true });
  });

  it("should find no link when the query string has none or repeats it", () => {
    expect(parseArtifactLinkSearch(new URLSearchParams("?team=core"))).toBeNull();
    expect(parseArtifactLinkSearch(new URLSearchParams("?artifact=abc&artifact=def"))).toBeNull();
  });
});

describe("commentIdFromHash", () => {
  it("should read the comment when the fragment is an old thread link's", () => {
    expect(commentIdFromHash("#comment-c-1")).toBe("c-1");
  });

  it("should find no comment when the fragment is something else", () => {
    expect(commentIdFromHash("")).toBeNull();
    expect(commentIdFromHash("#block=Intro")).toBeNull();
    expect(commentIdFromHash("#comment-<b>")).toBeNull();
  });
});

describe("parseArtifactLinkSearch with a fragment", () => {
  it("should take the comment from the fragment when an old thread link was redirected here", () => {
    expect(parseArtifactLinkSearch(new URLSearchParams("?artifact=abc&comments=1"), "#comment-c-1")).toEqual({ publicId: "abc", comments: true, commentId: "c-1" });
  });

  it("should prefer the query's comment when both name one", () => {
    expect(parseArtifactLinkSearch(new URLSearchParams("?artifact=abc&comment=c-2"), "#comment-c-1")?.commentId).toBe("c-2");
  });

  it("should ignore the fragment when the link does not open comments", () => {
    expect(parseArtifactLinkSearch(new URLSearchParams("?artifact=abc"), "#comment-c-1")).toEqual({ publicId: "abc", comments: false });
  });
});

describe("withoutCommentHash", () => {
  it("should drop the fragment when it only named the linked comment", () => {
    expect(withoutCommentHash("#comment-c-1")).toBe("");
  });

  it("should keep any other fragment when it is not a comment's", () => {
    expect(withoutCommentHash("#block=Intro")).toBe("#block=Intro");
  });
});
