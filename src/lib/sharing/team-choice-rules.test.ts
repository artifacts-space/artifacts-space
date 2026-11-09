import { describe, expect, it } from "vitest";

import { decideSharing } from "./rules";
import { chooseSharingTeam, notAMemberError } from "./team-choice-rules";
import { defaultActor } from "@/lib/teams/capability-rules";

const personal = { id: "t-personal", slug: "ada", personal: true };
const acme = { id: "t-acme", slug: "acme", personal: false };
const beta = { id: "t-beta", slug: "beta", personal: false };
const outsiders = { id: "t-outsiders", slug: "outsiders", personal: false };

/** An agent: no personal team, a member of one shared team. */
const agentTeams = [acme];
/** A person: a personal team and two shared teams. */
const personTeams = [personal, acme, beta];

describe("chooseSharingTeam", () => {
  it("should keep the artifact's current team when an agent shares a team artifact by link without a team", () => {
    expect(chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: acme.id, memberships: agentTeams })).toEqual({ ok: true, teamId: acme.id });
  });

  it("should use the agent's only team when a private artifact is shared by link without a team", () => {
    expect(chooseSharingTeam({ level: "public", requestedTeamId: undefined, currentTeamId: null, memberships: agentTeams })).toEqual({ ok: true, teamId: acme.id });
  });

  it("should keep the current team when a person shares a team artifact by link without a team", () => {
    expect(chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: beta.id, memberships: personTeams })).toEqual({ ok: true, teamId: beta.id });
  });

  it("should use the personal team when a person shares a private artifact by link without a team", () => {
    expect(chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: null, memberships: personTeams })).toEqual({ ok: true, teamId: personal.id });
  });

  it("should use the requested team when the requester belongs to it", () => {
    expect(chooseSharingTeam({ level: "team", requestedTeamId: beta.id, currentTeamId: acme.id, memberships: personTeams })).toEqual({ ok: true, teamId: beta.id });
  });

  it("should refuse when the requested team is one the requester does not belong to", () => {
    expect(chooseSharingTeam({ level: "link", requestedTeamId: outsiders.id, currentTeamId: acme.id, memberships: agentTeams })).toEqual({ ok: false, error: notAMemberError });
    expect(chooseSharingTeam({ level: "team", requestedTeamId: outsiders.id, currentTeamId: null, memberships: personTeams })).toEqual({ ok: false, error: notAMemberError });
  });

  it("should not reuse the current team when the requester has left it", () => {
    const choice = chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: outsiders.id, memberships: personTeams });
    expect(choice).toEqual({ ok: true, teamId: personal.id });
    const agentChoice = chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: outsiders.id, memberships: agentTeams });
    expect(agentChoice).toEqual({ ok: true, teamId: acme.id });
  });

  it("should name the teams to pass when several teams fit and none is implied", () => {
    const choice = chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: null, memberships: [acme, beta] });
    expect(choice).toEqual({ ok: false, error: 'Choose a team to share with: pass team as one of "acme", "beta" (from teams_list).' });
  });

  it("should name only shared teams when team sharing has no team", () => {
    const choice = chooseSharingTeam({ level: "team", requestedTeamId: null, currentTeamId: null, memberships: personTeams });
    expect(choice).toEqual({ ok: false, error: 'Choose a team to share with: pass team as one of "acme", "beta" (from teams_list).' });
  });

  it("should not share with the personal team when team sharing reuses a personal current team", () => {
    const choice = chooseSharingTeam({ level: "team", requestedTeamId: null, currentTeamId: personal.id, memberships: [personal] });
    expect(choice.ok).toBe(false);
  });

  it("should refuse when the requester is in no team", () => {
    expect(chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: null, memberships: [] }).ok).toBe(false);
  });

  it("should still make an agent wait for approval when the team is inferred", () => {
    const choice = chooseSharingTeam({ level: "link", requestedTeamId: null, currentTeamId: acme.id, memberships: agentTeams });
    expect(choice.ok).toBe(true);
    const team = { personal: acme.personal, teamSharingNeedsApproval: false };
    expect(decideSharing({ level: "link", team, member: defaultActor("owner"), actor: "agent" })).toBe("pending");
    expect(decideSharing({ level: "public", team, member: defaultActor("admin"), actor: "agent" })).toBe("pending");
  });
});
