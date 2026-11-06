import { describe, expect, it } from "vitest";

import { canEditTeamSettings, canManageTeam, parseTeamRole, roleLabel } from "./roles";

describe("parseTeamRole", () => {
  it("should read a single known role", () => {
    expect(parseTeamRole("owner")).toBe("owner");
    expect(parseTeamRole("admin")).toBe("admin");
  });

  it("should pick the highest role when several are stored", () => {
    expect(parseTeamRole("member, admin")).toBe("admin");
    expect(parseTeamRole("admin,owner")).toBe("owner");
  });

  it("should treat unknown or missing roles as member", () => {
    expect(parseTeamRole("superuser")).toBe("member");
    expect(parseTeamRole(null)).toBe("member");
    expect(parseTeamRole("")).toBe("member");
  });
});

describe("role permissions", () => {
  it("should let owners and admins manage the team", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
  });

  it("should let only owners edit team settings", () => {
    expect(canEditTeamSettings("owner")).toBe(true);
    expect(canEditTeamSettings("admin")).toBe(false);
  });

  it("should label roles for the UI", () => {
    expect(roleLabel("admin")).toBe("Admin");
  });
});
