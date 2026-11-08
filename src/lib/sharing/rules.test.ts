import { describe, expect, it } from "vitest";

import { agentArtifactTeamProblem, canDecideRequest, canWithdrawSharing, decideSharing, isLevelAllowedInTeam, requestStillValid, sharingNeedsApproval } from "./rules";

const personal = { personal: true, teamSharingNeedsApproval: true };
const strictTeam = { personal: false, teamSharingNeedsApproval: true };
const openTeam = { personal: false, teamSharingNeedsApproval: false };

describe("sharingNeedsApproval", () => {
  it("should never need approval when the team is personal", () => {
    expect(sharingNeedsApproval("link", personal)).toBe(false);
    expect(sharingNeedsApproval("public", personal)).toBe(false);
  });

  it("should follow the team's rule when sharing with the team", () => {
    expect(sharingNeedsApproval("team", strictTeam)).toBe(true);
    expect(sharingNeedsApproval("team", openTeam)).toBe(false);
  });

  it("should always need approval for link and public sharing in a shared team", () => {
    expect(sharingNeedsApproval("link", openTeam)).toBe(true);
    expect(sharingNeedsApproval("public", openTeam)).toBe(true);
  });
});

describe("decideSharing", () => {
  it("should apply when no approval is needed", () => {
    expect(decideSharing({ level: "public", team: personal, role: "owner", actor: "agent" })).toBe("apply");
    expect(decideSharing({ level: "team", team: openTeam, role: "member", actor: "agent" })).toBe("apply");
  });

  it("should wait for approval when a member asks", () => {
    expect(decideSharing({ level: "team", team: strictTeam, role: "member", actor: "person" })).toBe("pending");
    expect(decideSharing({ level: "link", team: openTeam, role: "member", actor: "person" })).toBe("pending");
  });

  it("should apply when an owner or admin asks in the web app", () => {
    expect(decideSharing({ level: "public", team: strictTeam, role: "admin", actor: "person" })).toBe("apply");
    expect(decideSharing({ level: "team", team: strictTeam, role: "owner", actor: "person" })).toBe("apply");
  });

  it("should wait for approval when an agent asks, even for an owner", () => {
    expect(decideSharing({ level: "public", team: strictTeam, role: "owner", actor: "agent" })).toBe("pending");
  });
});

describe("isLevelAllowedInTeam", () => {
  it("should refuse team sharing with a personal team", () => {
    expect(isLevelAllowedInTeam("team", personal)).toBe(false);
    expect(isLevelAllowedInTeam("link", personal)).toBe(true);
    expect(isLevelAllowedInTeam("team", strictTeam)).toBe(true);
  });
});

describe("canWithdrawSharing", () => {
  it("should let the author or a team manager withdraw", () => {
    expect(canWithdrawSharing({ viewerId: "a", authorId: "a", viewerRole: null })).toBe(true);
    expect(canWithdrawSharing({ viewerId: "b", authorId: "a", viewerRole: "admin" })).toBe(true);
    expect(canWithdrawSharing({ viewerId: "b", authorId: "a", viewerRole: "member" })).toBe(false);
    expect(canWithdrawSharing({ viewerId: "b", authorId: "a", viewerRole: null })).toBe(false);
  });
});

describe("canDecideRequest", () => {
  it("should let only owners and admins decide, and never agents", () => {
    expect(canDecideRequest({ viewerRole: "owner", actor: "person" })).toBe(true);
    expect(canDecideRequest({ viewerRole: "member", actor: "person" })).toBe(false);
    expect(canDecideRequest({ viewerRole: "owner", actor: "agent" })).toBe(false);
  });
});

describe("requestStillValid", () => {
  const base = { authorId: "agent-1", requestedBy: "agent-1", requesterActsForAuthor: false, authorInTeam: true };

  it("should hold when the author asked and is still in the team", () => {
    expect(requestStillValid(base)).toBe(true);
  });

  it("should hold when the person who added the agent asked and still acts for it", () => {
    expect(requestStillValid({ ...base, requestedBy: "owner-1", requesterActsForAuthor: true })).toBe(true);
  });

  it("should fail when someone else asked who does not act for the author", () => {
    expect(requestStillValid({ ...base, requestedBy: "teammate", requesterActsForAuthor: false })).toBe(false);
  });

  it("should fail when the author left the team even though the owner asked", () => {
    expect(requestStillValid({ ...base, requestedBy: "owner-1", requesterActsForAuthor: true, authorInTeam: false })).toBe(false);
    expect(requestStillValid({ ...base, authorInTeam: false })).toBe(false);
  });
});

describe("agentArtifactTeamProblem", () => {
  it("should accept the agent's own team when the owner shares the agent's artifact", () => {
    expect(agentArtifactTeamProblem({ authorInTeam: true })).toBeNull();
  });

  it("should refuse a team the agent is not in when the owner shares the agent's artifact", () => {
    expect(agentArtifactTeamProblem({ authorInTeam: false })).toMatch(/agent's team/);
  });
});
