import { describe, expect, it } from "vitest";

import { defaultActor, defaultRoleCapabilities } from "./capability-rules";
import { memberRowControls, resendableRole, type MemberRowInput, type RoleOption } from "./member-row-rules";

const roles: RoleOption[] = [
  { key: "owner", name: "Owner", capabilities: defaultRoleCapabilities.owner },
  { key: "admin", name: "Admin", capabilities: defaultRoleCapabilities.admin },
  { key: "member", name: "Member", capabilities: defaultRoleCapabilities.member },
  { key: "agent", name: "Agent", capabilities: defaultRoleCapabilities.agent },
  { key: "designer", name: "Designer", capabilities: ["themes.manage", "analytics.view"] },
];

function viewer(role: "owner" | "admin" | "member") {
  return { ...defaultActor(role), userId: "viewer", personal: false };
}

const base: MemberRowInput = { viewer: viewer("owner"), member: { userId: "other", roleKey: "member" }, roles, ownerCount: 1 };
const keys = (input: MemberRowInput) => memberRowControls(input).roleOptions.map((role) => role.key);

describe("memberRowControls", () => {
  it("should offer every role but Agent, current first, when an owner changes a member", () => {
    expect(keys(base)).toEqual(["member", "owner", "admin", "designer"]);
    expect(memberRowControls(base).canRemove).toBe(true);
  });

  it("should never offer Owner when an admin changes a member", () => {
    expect(keys({ ...base, viewer: viewer("admin") })).toEqual(["member", "admin", "designer"]);
  });

  it("should offer nothing when the viewer is a plain member", () => {
    expect(memberRowControls({ ...base, viewer: viewer("member") })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("should offer nothing when the row is the viewer", () => {
    expect(memberRowControls({ ...base, member: { userId: "viewer", roleKey: "owner" }, ownerCount: 3 })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("should never let an admin change or remove an owner", () => {
    expect(memberRowControls({ ...base, viewer: viewer("admin"), member: { userId: "other", roleKey: "owner" }, ownerCount: 2 })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("should keep the last owner an owner", () => {
    expect(memberRowControls({ ...base, member: { userId: "other", roleKey: "owner" }, ownerCount: 1 })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("should let an owner change another owner when the team has two", () => {
    const controls = memberRowControls({ ...base, member: { userId: "other", roleKey: "owner" }, ownerCount: 2 });
    expect(controls.canRemove).toBe(true);
    expect(controls.roleOptions[0]?.key).toBe("owner");
  });

  it("should offer nothing in a personal team", () => {
    expect(memberRowControls({ ...base, viewer: { ...viewer("owner"), personal: true } })).toEqual({ roleOptions: [], canRemove: false });
  });
});

describe("resendableRole", () => {
  it("should resend admin and member invitations and refuse owner ones", () => {
    expect(resendableRole("admin")).toBe("admin");
    expect(resendableRole("member")).toBe("member");
    expect(resendableRole("owner")).toBeNull();
  });
});
