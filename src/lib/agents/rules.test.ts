import { describe, expect, it } from "vitest";

import { canManageAgents } from "./rules";

describe("canManageAgents", () => {
  it("should let owners and admins of a shared team manage agents", () => {
    expect(canManageAgents({ role: "owner", personal: false })).toBe(true);
    expect(canManageAgents({ role: "admin", personal: false })).toBe(true);
  });

  it("should refuse members, personal teams, and non-members", () => {
    expect(canManageAgents({ role: "member", personal: false })).toBe(false);
    expect(canManageAgents({ role: "owner", personal: true })).toBe(false);
    expect(canManageAgents(null)).toBe(false);
  });
});
