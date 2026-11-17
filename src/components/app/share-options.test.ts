import { describe, expect, it } from "vitest";

import { choiceOutcome, defaultTeamId, outcomeText, ruleTeamFor, selectedTeamLabel, shareChoiceBasis, teamsFor, undoApplies } from "./share-options";
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

describe("choiceOutcome", () => {
  const open: ShareTeam = { ...strict, id: "o", slug: "open", name: "Open", teamSharingNeedsApproval: false };

  it("should apply at once for private, for the personal team, and for a team whose sharing needs no approval", () => {
    expect(choiceOutcome("private", undefined)).toBe("apply");
    expect(choiceOutcome("public", personal)).toBe("apply");
    expect(choiceOutcome("team", open)).toBe("apply");
  });

  it("should wait when a member shares in a team that needs an approval, and for a link in any shared team", () => {
    expect(choiceOutcome("team", strict)).toBe("pending");
    expect(choiceOutcome("link", open)).toBe("pending");
  });
});

describe("undoApplies", () => {
  const open: ShareTeam = { ...strict, id: "o", slug: "open", name: "Open", teamSharingNeedsApproval: false };

  it("should offer Undo when the artifact was private before, since making it private always applies", () => {
    expect(undoApplies({ visibility: "private", teamId: null }, teams)).toBe(true);
  });

  it("should offer Undo when sharing it with its team again needs no approval", () => {
    expect(undoApplies({ visibility: "team", teamId: "o" }, [personal, open])).toBe(true);
  });

  it("should offer no Undo when putting it back would only file a request, or its team is not the viewer's", () => {
    expect(undoApplies({ visibility: "team", teamId: "s" }, teams)).toBe(false);
    expect(undoApplies({ visibility: "link", teamId: "o" }, [personal, open])).toBe(false);
    expect(undoApplies({ visibility: "team", teamId: "gone" }, teams)).toBe(false);
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

describe("shareChoiceBasis", () => {
  const stored = {
    id: "a1",
    publicId: "4fXkP9qR2sT7vW1yZ3aB5c",
    title: "Plan",
    icon: null,
    visibility: "private" as const,
    teamId: null,
    comments: "off" as const,
    showInSearch: false,
    pendingSharing: null,
    pendingEdit: null,
    pendingComments: null,
  };

  it("should stay the same when nothing about the stored sharing changes", () => {
    expect(shareChoiceBasis({ ...stored, title: "Renamed" })).toBe(shareChoiceBasis(stored));
  });

  it("should change when a save moves the artifact into a team", () => {
    expect(shareChoiceBasis({ ...stored, visibility: "team", teamId: "t1" })).not.toBe(shareChoiceBasis(stored));
  });

  it("should change when a request starts waiting while the level stays", () => {
    const pendingSharing = { requestId: "r1", level: "team" as const, teamId: "t1", comments: null, requestedAt: "2026-11-11T12:00:00.000Z" };
    expect(shareChoiceBasis({ ...stored, pendingSharing })).not.toBe(shareChoiceBasis(stored));
  });

  it("should change when comments or search engines change", () => {
    expect(shareChoiceBasis({ ...stored, comments: "team" })).not.toBe(shareChoiceBasis(stored));
    expect(shareChoiceBasis({ ...stored, showInSearch: true })).not.toBe(shareChoiceBasis(stored));
  });
});
