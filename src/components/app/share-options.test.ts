import { describe, expect, it } from "vitest";

import { defaultTeamId, outcomeText, ruleTeamFor, selectedTeamLabel, teamsFor } from "./share-options";
import type { ShareTeam } from "./share-teams-context";
import { defaultActor } from "@/lib/teams/capability-rules";

const personal: ShareTeam = { id: "p", slug: "me", name: "Me", personal: true, role: "owner", ...defaultActor("owner"), teamSharingNeedsApproval: false };
const strict: ShareTeam = { id: "s", slug: "strict", name: "Strict", personal: false, role: "member", ...defaultActor("member"), teamSharingNeedsApproval: true };
const teams = [personal, strict];

describe("teamsFor", () => {
  it("should offer only shared teams for team sharing", () => {
    expect(teamsFor("team", teams).map((team) => team.id)).toEqual(["s"]);
  });

  it("should offer every team to approve link or public sharing", () => {
    expect(teamsFor("link", teams).map((team) => team.id)).toEqual(["p", "s"]);
  });
});

describe("defaultTeamId", () => {
  it("should keep the current team when it fits the level", () => {
    expect(defaultTeamId("link", teams, "s")).toBe("s");
  });

  it("should fall back to the first fitting team", () => {
    expect(defaultTeamId("team", teams, "p")).toBe("s");
    expect(defaultTeamId("public", teams, null)).toBe("p");
  });
});

describe("outcomeText", () => {
  it("should say it applies now when the personal team approves itself", () => {
    expect(outcomeText("public", personal)).toMatch(/applies/);
  });

  it("should say an admin approves first when a member shares in a strict team", () => {
    expect(outcomeText("team", strict)).toMatch(/approves it first/);
  });
});

describe("selectedTeamLabel", () => {
  it("should show the personal team's name, marked personal, when its id is chosen", () => {
    expect(selectedTeamLabel("p", teams)).toBe("Me (personal)");
  });

  it("should show a shared team's name when its id is chosen", () => {
    expect(selectedTeamLabel("s", teams)).toBe("Strict");
  });

  it("should ask for a team when no known team is chosen", () => {
    expect(selectedTeamLabel("", teams)).toBe("Choose a team");
    expect(selectedTeamLabel(null, teams)).toBe("Choose a team");
  });
});

describe("ruleTeamFor", () => {
  const open: ShareTeam = { ...strict, id: "o", slug: "open", name: "Open", teamSharingNeedsApproval: false };

  it("should state the team's rule when a team artifact stays in its team", () => {
    expect(ruleTeamFor("team", strict)?.id).toBe("s");
    expect(ruleTeamFor("link", strict)?.id).toBe("s");
  });

  it("should state the team's rule when a personal artifact moves into a shared team, at every shared level", () => {
    expect(ruleTeamFor("team", open)?.id).toBe("o");
    expect(ruleTeamFor("link", open)?.id).toBe("o");
    expect(ruleTeamFor("public", strict)?.id).toBe("s");
  });

  it("should state no rule while the artifact stays private", () => {
    expect(ruleTeamFor("private", undefined)).toBeNull();
    expect(ruleTeamFor("private", strict)).toBeNull();
  });

  it("should state no rule when a link or public level is approved by the personal team", () => {
    expect(ruleTeamFor("link", personal)).toBeNull();
    expect(ruleTeamFor("public", personal)).toBeNull();
  });

  it("should state no rule when no team is picked yet", () => {
    expect(ruleTeamFor("team", undefined)).toBeNull();
  });
});
