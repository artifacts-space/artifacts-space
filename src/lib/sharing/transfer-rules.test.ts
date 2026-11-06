import { describe, expect, it } from "vitest";

import { artifactsToTransfer, pickTransferOwner, transferredOwnership, type TransferArtifact } from "./transfer-rules";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

describe("pickTransferOwner", () => {
  it("should pick the longest-standing owner", () => {
    expect(
      pickTransferOwner([
        { userId: "late-owner", role: "owner", joinedAt: day(5) },
        { userId: "early-admin", role: "admin", joinedAt: day(1) },
        { userId: "early-owner", role: "owner", joinedAt: day(2) },
      ]),
    ).toBe("early-owner");
  });

  it("should fall back to an admin when no owner is left", () => {
    expect(pickTransferOwner([{ userId: "admin", role: "admin", joinedAt: day(3) }, { userId: "m", role: "member", joinedAt: day(1) }])).toBe("admin");
  });

  it("should return null when only members are left", () => {
    expect(pickTransferOwner([{ userId: "m", role: "member", joinedAt: day(1) }])).toBeNull();
  });
});

describe("artifactsToTransfer", () => {
  const base = { originalAuthorId: null };
  const artifacts: TransferArtifact[] = [
    { ...base, id: "shared", userId: "gone", visibility: "team", teamId: "t1" },
    { ...base, id: "link", userId: "gone", visibility: "link", teamId: "t1" },
    { ...base, id: "private", userId: "gone", visibility: "private", teamId: "t1" },
    { ...base, id: "other-team", userId: "gone", visibility: "team", teamId: "t2" },
    { ...base, id: "member-owned", userId: "stays", visibility: "team", teamId: "t1" },
  ];

  it("should move only shared artifacts of former members in this team", () => {
    const moved = artifactsToTransfer(artifacts, "t1", new Set(["stays"])).map((item) => item.id);
    expect(moved).toEqual(["shared", "link"]);
  });

  it("should keep private artifacts with their author when the author leaves", () => {
    const moved = artifactsToTransfer(artifacts, "t1", new Set(["stays"]));
    expect(moved.some((item) => item.visibility === "private")).toBe(false);
  });
});

describe("transferredOwnership", () => {
  it("should record the original author when an artifact moves", () => {
    expect(transferredOwnership({ id: "a", userId: "gone", visibility: "team", teamId: "t1", originalAuthorId: null }, "owner")).toEqual({
      userId: "owner",
      originalAuthorId: "gone",
    });
  });

  it("should keep the first author when an artifact moves again", () => {
    expect(transferredOwnership({ id: "a", userId: "second", visibility: "team", teamId: "t1", originalAuthorId: "first" }, "owner")).toEqual({
      userId: "owner",
      originalAuthorId: "first",
    });
  });
});
