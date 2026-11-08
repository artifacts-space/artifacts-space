import { describe, expect, it } from "vitest";

import { safeNextPath, withNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("should keep a path on this site", () => {
    expect(safeNextPath("/invitations/abc")).toBe("/invitations/abc");
    expect(safeNextPath("/teams/new?from=pricing")).toBe("/teams/new?from=pricing");
  });

  it("should reject other origins and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
  });

  it("should reject a path the browser would turn into another origin", () => {
    expect(safeNextPath("/\t/evil.example")).toBeNull();
    expect(safeNextPath("/\n/evil.example")).toBeNull();
  });

  it("should reject javascript: and data: URLs", () => {
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("JavaScript:alert(1)")).toBeNull();
    expect(safeNextPath("data:text/html,hi")).toBeNull();
  });

  it("should return null when there is no next path", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});

describe("withNextPath", () => {
  it("should carry a path on this site to the other auth page", () => {
    expect(withNextPath("/sign-in", "/teams/new")).toBe("/sign-in?next=%2Fteams%2Fnew");
  });

  it("should drop the destination when it is external, protocol-relative, or javascript:", () => {
    expect(withNextPath("/sign-in", "https://evil.example")).toBe("/sign-in");
    expect(withNextPath("/sign-up", "//evil.example")).toBe("/sign-up");
    expect(withNextPath("/sign-up", "javascript:alert(1)")).toBe("/sign-up");
  });

  it("should return the bare page when there is no destination", () => {
    expect(withNextPath("/sign-in", null)).toBe("/sign-in");
  });
});
