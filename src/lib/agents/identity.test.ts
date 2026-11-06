import { describe, expect, it } from "vitest";

import { agentEmail, attribution, isAgentEmail, toActor, tokenUserIsActive, type ActorRow } from "./identity";

const personRow: ActorRow = {
  userId: "u1",
  name: "Charles",
  username: "charles",
  agentTeamId: null,
  ownerId: null,
  ownerName: null,
  mutedAt: null,
  inAgentTeam: false,
};
const agentRow: ActorRow = {
  userId: "a1",
  name: "Claude Code",
  username: "claude-code",
  agentTeamId: "t1",
  ownerId: "u1",
  ownerName: "Charles",
  mutedAt: null,
  inAgentTeam: true,
};

describe("agent emails", () => {
  it("should give agents an email on the unroutable .invalid domain", () => {
    expect(agentEmail("abc")).toBe("agent-abc@agents.artifacts.invalid");
    expect(isAgentEmail(agentEmail("abc"))).toBe(true);
  });

  it("should match agent emails regardless of case and spacing", () => {
    expect(isAgentEmail("  Agent-X@AGENTS.artifacts.INVALID ")).toBe(true);
  });

  it("should not treat people's emails or other values as agent emails", () => {
    expect(isAgentEmail("charles@example.com")).toBe(false);
    expect(isAgentEmail("x@notagents.artifacts.invalid.example.com")).toBe(false);
    expect(isAgentEmail(null)).toBe(false);
  });
});

describe("agent token identity", () => {
  it("should resolve a personal token to the person", () => {
    expect(toActor(personRow)).toEqual({ kind: "person", userId: "u1", handle: "charles", name: "Charles" });
  });

  it("should resolve an agent token to the agent with its team and owner", () => {
    expect(toActor(agentRow)).toEqual({
      kind: "agent",
      userId: "a1",
      handle: "claude-code",
      name: "Claude Code",
      teamId: "t1",
      ownerId: "u1",
      ownerName: "Charles",
      teamMuted: false,
    });
  });

  it("should mark an agent muted by its team", () => {
    expect(toActor({ ...agentRow, mutedAt: new Date() })).toMatchObject({ kind: "agent", teamMuted: true });
  });

  it("should refuse an agent that is no longer in its team", () => {
    expect(toActor({ ...agentRow, inAgentTeam: false })).toBeNull();
    expect(tokenUserIsActive({ agentTeamId: "t1", agentMemberId: null })).toBe(false);
  });

  it("should accept people and agents that are still in their team", () => {
    expect(tokenUserIsActive({ agentTeamId: null, agentMemberId: null })).toBe(true);
    expect(tokenUserIsActive({ agentTeamId: "t1", agentMemberId: "m1" })).toBe(true);
  });
});

describe("attribution", () => {
  it("should credit an agent's work to the agent for its owner", () => {
    expect(attribution({ kind: "agent", handle: "claude-code", name: "Claude Code", ownerName: "Charles" })).toBe("@claude-code for Charles");
  });

  it("should credit people by handle, then name", () => {
    expect(attribution({ kind: "person", handle: "charles", name: "Charles" })).toBe("@charles");
    expect(attribution({ kind: "person", handle: null, name: "Charles" })).toBe("Charles");
  });
});
