import { describe, expect, it } from "vitest";

import {
  canChangeCommentSetting,
  canSeeComments,
  commentsAfterSharing,
  decideCommentSetting,
  defaultCommentSetting,
  hiddenCommentsMessage,
  opensCommentsInTeam,
} from "./setting-rules";

const shared = { personal: false, teamSharingNeedsApproval: true };
const personal = { personal: true, teamSharingNeedsApproval: false };
const outsider = { canViewArtifact: true, isAuthor: false, isTeamMember: false };

describe("canSeeComments", () => {
  it("should hide comments from everyone, the author included, when comments are off", () => {
    expect(canSeeComments("off", { ...outsider, isAuthor: true, isTeamMember: true })).toBe(false);
  });

  it("should show team-only comments to the author and team members but not to other readers", () => {
    expect(canSeeComments("team", { ...outsider, isAuthor: true })).toBe(true);
    expect(canSeeComments("team", { ...outsider, isTeamMember: true })).toBe(true);
    expect(canSeeComments("team", outsider)).toBe(false);
  });

  it("should show comments to any reader when they are open to anyone signed in", () => {
    expect(canSeeComments("signed_in", outsider)).toBe(true);
  });

  it("should never show comments when the viewer cannot read the artifact", () => {
    expect(canSeeComments("signed_in", { ...outsider, canViewArtifact: false })).toBe(false);
  });
});

describe("hiddenCommentsMessage", () => {
  it("should say comments are off when they are off", () => {
    expect(hiddenCommentsMessage("off")).toMatch(/off/);
  });

  it("should name the team when comments are team-only", () => {
    expect(hiddenCommentsMessage("team")).toMatch(/team/);
  });
});

describe("defaultCommentSetting", () => {
  it("should turn comments off for link and public artifacts in a personal team", () => {
    expect(defaultCommentSetting({ visibility: "link", teamPersonal: true })).toBe("off");
    expect(defaultCommentSetting({ visibility: "public", teamPersonal: true })).toBe("off");
  });

  it("should keep comments to the team for artifacts in a shared team", () => {
    expect(defaultCommentSetting({ visibility: "team", teamPersonal: false })).toBe("team");
    expect(defaultCommentSetting({ visibility: "public", teamPersonal: false })).toBe("team");
  });

  it("should keep comments to the author for private artifacts", () => {
    expect(defaultCommentSetting({ visibility: "private", teamPersonal: null })).toBe("team");
  });
});

describe("commentsAfterSharing", () => {
  it("should use the requested setting when one is given", () => {
    expect(commentsAfterSharing({ current: "team", requested: "off", sameTeam: true, next: { visibility: "public", teamPersonal: false } })).toBe("off");
  });

  it("should keep the current setting when the artifact stays in the same team", () => {
    expect(commentsAfterSharing({ current: "signed_in", requested: undefined, sameTeam: true, next: { visibility: "link", teamPersonal: true } })).toBe("signed_in");
  });

  it("should keep the current setting when the artifact turns private", () => {
    expect(commentsAfterSharing({ current: "off", requested: undefined, sameTeam: false, next: { visibility: "private", teamPersonal: null } })).toBe("off");
  });

  it("should take the default when the artifact moves to another team", () => {
    expect(commentsAfterSharing({ current: "team", requested: undefined, sameTeam: false, next: { visibility: "public", teamPersonal: true } })).toBe("off");
    expect(commentsAfterSharing({ current: "signed_in", requested: undefined, sameTeam: false, next: { visibility: "public", teamPersonal: false } })).toBe("team");
  });
});

describe("opensCommentsInTeam", () => {
  it("should treat signed_in in a shared team as a widening when it was not signed_in there before", () => {
    expect(opensCommentsInTeam({ current: "team", next: "signed_in", sameTeam: true, team: shared })).toBe(true);
    expect(opensCommentsInTeam({ current: "signed_in", next: "signed_in", sameTeam: false, team: shared })).toBe(true);
  });

  it("should not treat keeping signed_in in the same team as a widening", () => {
    expect(opensCommentsInTeam({ current: "signed_in", next: "signed_in", sameTeam: true, team: shared })).toBe(false);
  });

  it("should never need approval in a personal team or without a team", () => {
    expect(opensCommentsInTeam({ current: "off", next: "signed_in", sameTeam: true, team: personal })).toBe(false);
    expect(opensCommentsInTeam({ current: "off", next: "signed_in", sameTeam: true, team: null })).toBe(false);
  });
});

describe("decideCommentSetting", () => {
  const base = { current: "team" as const, sameTeam: true, team: shared };

  it("should apply narrowing at once for anyone allowed to change it", () => {
    expect(decideCommentSetting({ ...base, next: "off", role: "member", actor: "agent" })).toBe("apply");
    expect(decideCommentSetting({ ...base, current: "signed_in", next: "team", role: "member", actor: "person" })).toBe("apply");
  });

  it("should send widening to signed_in for approval when a member or an agent asks", () => {
    expect(decideCommentSetting({ ...base, next: "signed_in", role: "member", actor: "person" })).toBe("pending");
    expect(decideCommentSetting({ ...base, next: "signed_in", role: "owner", actor: "agent" })).toBe("pending");
  });

  it("should let an owner or admin open comments to anyone signed in at once", () => {
    expect(decideCommentSetting({ ...base, next: "signed_in", role: "admin", actor: "person" })).toBe("apply");
  });

  it("should apply signed_in at once in a personal team", () => {
    expect(decideCommentSetting({ ...base, team: personal, next: "signed_in", role: "owner", actor: "agent" })).toBe("apply");
  });
});

describe("canChangeCommentSetting", () => {
  it("should let the author change it", () => {
    expect(canChangeCommentSetting({ viewerId: "a", authorId: "a", viewerRole: null, teamPersonal: null, actor: "agent" })).toBe(true);
  });

  it("should let owners and admins of a shared team change it", () => {
    expect(canChangeCommentSetting({ viewerId: "b", authorId: "a", viewerRole: "admin", teamPersonal: false, actor: "person" })).toBe(true);
  });

  it("should refuse members, agents, and anyone when the team is personal", () => {
    expect(canChangeCommentSetting({ viewerId: "b", authorId: "a", viewerRole: "member", teamPersonal: false, actor: "person" })).toBe(false);
    expect(canChangeCommentSetting({ viewerId: "b", authorId: "a", viewerRole: "owner", teamPersonal: false, actor: "agent" })).toBe(false);
    expect(canChangeCommentSetting({ viewerId: "b", authorId: "a", viewerRole: "owner", teamPersonal: true, actor: "person" })).toBe(false);
  });
});
