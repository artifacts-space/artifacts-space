import { describe, expect, it } from "vitest";

import { availableArtifactViews, availableTeamTabs, isArtifactView, isTeamTab, parseTeamTabs, teamTabHref, teamTabSearch } from "./team-tabs-rules";

const manager = { personal: false, reviews: true, reports: true };
const member = { personal: false, reviews: false, reports: false };
const personal = { personal: true, reviews: false, reports: false };

describe("availableTeamTabs", () => {
  it("should show all four tabs when the team is shared", () => {
    expect(availableTeamTabs(member)).toEqual(["members", "permissions", "artifacts", "themes"]);
  });

  it("should hide permissions and themes when the team is personal", () => {
    expect(availableTeamTabs(personal)).toEqual(["members", "artifacts"]);
  });
});

describe("availableArtifactViews", () => {
  it("should offer approval and reports when the viewer manages the team", () => {
    expect(availableArtifactViews(manager)).toEqual(["shared", "approval", "reports"]);
  });

  it("should offer only the shared list when the viewer is a plain member", () => {
    expect(availableArtifactViews(member)).toEqual(["shared"]);
  });
});

describe("parseTeamTabs", () => {
  it("should open the tab and view named in the URL when the viewer may see them", () => {
    expect(parseTeamTabs({ tab: "artifacts", view: "approval" }, manager)).toEqual({ tab: "artifacts", view: "approval" });
  });

  it("should open Members when the tab is missing", () => {
    expect(parseTeamTabs({}, manager)).toEqual({ tab: "members", view: "shared" });
  });

  it("should open Members when the tab is unknown", () => {
    expect(parseTeamTabs({ tab: "billing" }, manager).tab).toBe("members");
  });

  it("should open Members when the tab is hidden for a personal team", () => {
    expect(parseTeamTabs({ tab: "themes" }, personal).tab).toBe("members");
  });

  it("should open Shared when a plain member asks for the approval view", () => {
    expect(parseTeamTabs({ tab: "artifacts", view: "approval" }, member).view).toBe("shared");
  });

  it("should ignore repeated params when the URL names a tab twice", () => {
    expect(parseTeamTabs({ tab: ["themes", "members"] }, manager).tab).toBe("members");
  });
});

describe("teamTabSearch and teamTabHref", () => {
  it("should name only the tab when the view is Shared", () => {
    expect(teamTabSearch({ tab: "artifacts", view: "shared" })).toBe("?tab=artifacts");
  });

  it("should drop the view when the tab is not Shared artifacts", () => {
    expect(teamTabSearch({ tab: "members", view: "approval" })).toBe("?tab=members");
  });

  it("should build a deep link to the approval view when a notification needs one", () => {
    expect(teamTabHref("core team", "artifacts", "approval")).toBe("/teams/core%20team?tab=artifacts&view=approval");
  });

  it("should round-trip through parseTeamTabs when the viewer may see the view", () => {
    const params = Object.fromEntries(new URLSearchParams(teamTabSearch({ tab: "artifacts", view: "reports" })));
    expect(parseTeamTabs(params, manager)).toEqual({ tab: "artifacts", view: "reports" });
  });
});

describe("isTeamTab and isArtifactView", () => {
  it("should accept known ids and refuse anything else", () => {
    expect(isTeamTab("themes")).toBe(true);
    expect(isTeamTab("approval")).toBe(false);
    expect(isArtifactView("approval")).toBe(true);
    expect(isArtifactView(null)).toBe(false);
  });
});
