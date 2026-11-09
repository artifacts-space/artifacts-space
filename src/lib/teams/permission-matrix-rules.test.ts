import { describe, expect, it } from "vitest";

import { currentGrant, matrixCapabilities, matrixRoles, type MatrixCapability, type MatrixRole } from "./permission-matrix-rules";

const open = { teamSharingNeedsApproval: false };
const approval = { teamSharingNeedsApproval: true };

function column(role: MatrixRole, team = open) {
  return (capability: MatrixCapability) => currentGrant(role, capability, team);
}

describe("currentGrant", () => {
  it("should give owners every capability when the team is shared", () => {
    const owner = column("owner");
    expect(matrixCapabilities.filter((capability) => owner(capability) !== "yes")).toEqual([]);
  });

  it("should keep admins off owners and off the sharing rule when they manage the team", () => {
    const admin = column("admin");
    expect(admin("removeMembers")).toBe("limited");
    expect(admin("changeRoles")).toBe("limited");
    expect(admin("sharingRule")).toBe("no");
    expect(admin("approveSharing")).toBe("yes");
  });

  it("should make members ask first when they share by link or in public", () => {
    const member = column("member");
    expect(member("shareLink")).toBe("asks");
    expect(member("sharePublic")).toBe("asks");
    expect(member("shareTeam")).toBe("yes");
  });

  it("should make members ask first for team sharing when the team rule needs approval", () => {
    expect(currentGrant("member", "shareTeam", approval)).toBe("asks");
  });

  it("should never let a member approve, invite, or manage when the table is drawn", () => {
    const member = column("member");
    for (const capability of ["approveSharing", "approveEdits", "invite", "removeMembers", "changeRoles", "manageAgents", "manageThemes", "withdrawOthers", "sharingRule"] as const) {
      expect(member(capability), capability).toBe("no");
    }
  });

  it("should never let an agent approve or manage anything when the table is drawn", () => {
    const agent = column("agent", approval);
    for (const capability of ["approveSharing", "approveEdits", "invite", "removeMembers", "changeRoles", "manageAgents", "manageThemes", "withdrawOthers", "sharingRule"] as const) {
      expect(agent(capability), capability).toBe("no");
    }
    expect(agent("shareTeam")).toBe("asks");
  });

  it("should fill every cell when every role is drawn", () => {
    for (const role of matrixRoles) {
      for (const capability of matrixCapabilities) expect(["yes", "asks", "limited", "no"]).toContain(currentGrant(role, capability, open));
    }
  });
});
