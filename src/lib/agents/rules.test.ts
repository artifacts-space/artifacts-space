import { describe, expect, it } from "vitest";

import { agentRemovalDescription, canManageAgents, removalKeeper } from "./rules";
import { defaultActor } from "@/lib/teams/capability-rules";

describe("canManageAgents", () => {
  it("should let owners and admins of a shared team manage agents", () => {
    expect(canManageAgents({ ...defaultActor("owner"), personal: false })).toBe(true);
    expect(canManageAgents({ ...defaultActor("admin"), personal: false })).toBe(true);
  });

  it("should refuse members, personal teams, and non-members", () => {
    expect(canManageAgents({ ...defaultActor("member"), personal: false })).toBe(false);
    expect(canManageAgents({ ...defaultActor("owner"), personal: true })).toBe(false);
    expect(canManageAgents(null)).toBe(false);
  });
});

describe("removalKeeper", () => {
  it("should hand the agent's own artifacts to the person who added it when they are still in the team", () => {
    expect(removalKeeper({ ownerId: "owner-1", ownerInTeam: true })).toBe("owner-1");
  });

  it("should hand them to nobody when the person who added it left the team or is gone", () => {
    expect(removalKeeper({ ownerId: "owner-1", ownerInTeam: false })).toBeNull();
    expect(removalKeeper({ ownerId: null, ownerInTeam: false })).toBeNull();
  });
});

describe("agentRemovalDescription", () => {
  it("should not mention artifacts when the agent has none of its own", () => {
    expect(agentRemovalDescription({ ownArtifacts: 0, keeperName: null })).not.toMatch(/artifact/);
  });

  it("should say the artifacts move to the person who added the agent when they keep them", () => {
    const text = agentRemovalDescription({ ownArtifacts: 3, keeperName: "Ada" });
    expect(text).toContain("Its 3 artifacts that the team cannot see move to Ada");
    expect(text).not.toMatch(/deleted/);
  });

  it("should say how many artifacts are deleted when nobody can keep them", () => {
    expect(agentRemovalDescription({ ownArtifacts: 1, keeperName: null })).toContain("1 artifact that the team cannot see");
    expect(agentRemovalDescription({ ownArtifacts: 12, keeperName: null })).toContain("They are deleted with the agent, and this cannot be undone");
  });
});
