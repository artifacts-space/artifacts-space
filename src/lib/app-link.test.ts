import { describe, expect, it } from "vitest";

import { artifactLinkHref, parseArtifactLink, parseArtifactLinkSearch, withoutArtifactLink } from "./app-link";

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
});

describe("artifactLinkHref", () => {
  it("should build the link that opens the comments when asked", () => {
    expect(artifactLinkHref({ publicId: "abc", comments: true })).toBe("/app?artifact=abc&comments=1");
    expect(artifactLinkHref({ publicId: "abc", comments: false })).toBe("/app?artifact=abc");
  });
});

describe("withoutArtifactLink", () => {
  it("should drop only the link params when other filters are set", () => {
    expect(withoutArtifactLink("?team=core&artifact=abc&comments=1")).toBe("?team=core");
    expect(withoutArtifactLink("?artifact=abc")).toBe("");
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
