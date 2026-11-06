import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("should keep a path on this site", () => {
    expect(safeNextPath("/invitations/abc")).toBe("/invitations/abc");
  });

  it("should reject other origins and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
  });

  it("should return null when there is no next path", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});
