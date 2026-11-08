import { describe, expect, it } from "vitest";

import { agentRemovalDescription, canManageAgents } from "./rules";

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

describe("agentRemovalDescription", () => {
  it("should not mention deleted artifacts when removal deletes none", () => {
    expect(agentRemovalDescription(0)).not.toMatch(/deleted/);
  });

  it("should say how many artifacts go with the agent when removal deletes some", () => {
    expect(agentRemovalDescription(1)).toContain("1 artifact that only it and the person who added it can read. It is deleted with the agent");
    expect(agentRemovalDescription(12)).toContain("12 artifacts that only it and the person who added it can read. They are deleted with the agent");
    expect(agentRemovalDescription(12)).toContain("cannot be undone");
  });
});
