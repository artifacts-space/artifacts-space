import { describe, expect, it } from "vitest";

import {
  actingAs,
  agentLockedCapabilities,
  can,
  defaultActor,
  defaultRoleCapabilities,
  lockedReason,
  roleRank,
  teamCapabilities,
  type TeamActor,
  type TeamCapability,
} from "./capability-rules";

const everything: readonly TeamCapability[] = teamCapabilities;
const person = (roleKey: string, capabilities: readonly TeamCapability[] = []): TeamActor => ({ roleKey, kind: "person", capabilities });

describe("can, for every capability", () => {
  for (const capability of teamCapabilities) {
    describe(capability, () => {
      it("should refuse when there is no member", () => {
        expect(can(null, capability)).toBe(false);
        expect(can(undefined, capability)).toBe(false);
      });

      it("should refuse when a custom role does not grant it", () => {
        expect(can(person("designer", everything.filter((item) => item !== capability)), capability)).toBe(false);
      });

      it("should allow when a custom role grants it", () => {
        expect(can(person("designer", [capability]), capability)).toBe(true);
      });

      it("should allow an owner even when the owner row lists nothing", () => {
        expect(can(person("owner"), capability)).toBe(true);
      });

      it("should refuse an agent whose role row grants it when agents never hold it", () => {
        const agent: TeamActor = { roleKey: "agent", kind: "agent", capabilities: everything };
        expect(can(agent, capability)).toBe(!agentLockedCapabilities.has(capability));
      });

      it("should refuse an agent token acting with an owner's role when agents never hold it", () => {
        expect(can(actingAs(person("owner", everything), "agent"), capability)).toBe(!agentLockedCapabilities.has(capability));
      });

      it("should match today's rules for a default member", () => {
        expect(can(defaultActor("member"), capability)).toBe(defaultRoleCapabilities.member.includes(capability));
      });
    });
  }
});

describe("can, fail closed", () => {
  it("should refuse a capability name it does not know when a role lists it", () => {
    const actor: TeamActor = { roleKey: "designer", kind: "person", capabilities: everything };
    expect(can(actor, "members.delete-everything" as TeamCapability)).toBe(false);
  });

  it("should treat a person holding the agent key as an agent when it decides", () => {
    expect(can(person("agent", everything), "approve.sharing")).toBe(false);
  });

  it("should never let an agent approve, invite, change roles, or manage members when the defaults apply", () => {
    for (const capability of ["approve.sharing", "approve.edits", "members.invite", "members.roles", "members.remove", "agents.manage"] as const) {
      expect(can(defaultActor("agent"), capability), capability).toBe(false);
    }
  });
});

describe("roleRank and lockedReason", () => {
  it("should rank custom roles between Member and Admin", () => {
    expect(roleRank("designer")).toBeGreaterThan(roleRank("member"));
    expect(roleRank("designer")).toBeLessThan(roleRank("admin"));
    expect(roleRank("owner")).toBeGreaterThan(roleRank("admin"));
  });

  it("should lock every owner cell and the agent cells agents never hold", () => {
    for (const capability of teamCapabilities) {
      expect(lockedReason("owner", capability)).not.toBeNull();
      expect(lockedReason("agent", capability) !== null).toBe(agentLockedCapabilities.has(capability));
      expect(lockedReason("member", capability)).toBeNull();
    }
  });
});
