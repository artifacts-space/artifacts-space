import { describe, expect, it } from "vitest";

import { canEditMemberRow, resendableRole, rolesFor, type MemberRowInput } from "./member-row-rules";

const base: MemberRowInput = {
  canManage: true,
  viewerId: "viewer",
  viewerRole: "owner",
  member: { userId: "other", role: "member" },
  ownerCount: 1,
};

describe("canEditMemberRow", () => {
  it("should let an owner change a member when the viewer manages the team", () => {
    expect(canEditMemberRow(base)).toBe(true);
  });

  it("should refuse when the viewer does not manage the team", () => {
    expect(canEditMemberRow({ ...base, canManage: false })).toBe(false);
  });

  it("should refuse when the row is the viewer", () => {
    expect(canEditMemberRow({ ...base, member: { userId: "viewer", role: "owner" }, ownerCount: 3 })).toBe(false);
  });

  it("should refuse when an admin targets an owner", () => {
    expect(canEditMemberRow({ ...base, viewerRole: "admin", member: { userId: "other", role: "owner" }, ownerCount: 2 })).toBe(false);
  });

  it("should refuse when the owner is the team's last owner", () => {
    expect(canEditMemberRow({ ...base, member: { userId: "other", role: "owner" }, ownerCount: 1 })).toBe(false);
  });

  it("should let an owner change another owner when the team has two owners", () => {
    expect(canEditMemberRow({ ...base, member: { userId: "other", role: "owner" }, ownerCount: 2 })).toBe(true);
  });
});

describe("rolesFor", () => {
  it("should offer the owner role only when the viewer is an owner", () => {
    expect(rolesFor("owner")).toContain("owner");
    expect(rolesFor("admin")).not.toContain("owner");
  });
});

describe("resendableRole", () => {
  it("should resend admin and member invitations and refuse owner ones", () => {
    expect(resendableRole("admin")).toBe("admin");
    expect(resendableRole("member")).toBe("member");
    expect(resendableRole("owner")).toBeNull();
  });
});
