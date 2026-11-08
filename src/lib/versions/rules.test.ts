import { describe, expect, it } from "vitest";

import { presetTheme } from "@/lib/themes/resolve";

import { decideEdit, editNeedsAuditRow, sameReviewedFields, versionToServe, type ReviewedFields } from "./rules";

const sharedTeam = { personal: false, teamSharingNeedsApproval: true };
const openTeam = { personal: false, teamSharingNeedsApproval: false };
const personalTeam = { personal: true, teamSharingNeedsApproval: true };

describe("decideEdit", () => {
  it("should wait for approval when a member edits a link artifact in a shared team", () => {
    expect(decideEdit({ visibility: "link", team: sharedTeam, role: "member", actor: "person" })).toBe("pending");
  });

  it("should wait for approval when a member edits a public artifact even if team sharing needs no approval", () => {
    expect(decideEdit({ visibility: "public", team: openTeam, role: "member", actor: "person" })).toBe("pending");
  });

  it("should apply when an owner or admin edits in the web app", () => {
    expect(decideEdit({ visibility: "public", team: sharedTeam, role: "admin", actor: "person" })).toBe("apply");
    expect(decideEdit({ visibility: "link", team: sharedTeam, role: "owner", actor: "person" })).toBe("apply");
  });

  it("should wait for approval when an agent edits, even for an owner", () => {
    expect(decideEdit({ visibility: "link", team: sharedTeam, role: "owner", actor: "agent" })).toBe("pending");
  });

  it("should apply when the artifact is only shared with the team or private", () => {
    expect(decideEdit({ visibility: "team", team: sharedTeam, role: "member", actor: "agent" })).toBe("apply");
    expect(decideEdit({ visibility: "private", team: null, role: null, actor: "agent" })).toBe("apply");
  });

  it("should apply when the approving team is a personal team", () => {
    expect(decideEdit({ visibility: "public", team: personalTeam, role: "owner", actor: "agent" })).toBe("apply");
  });

  it("should apply when a link artifact has no approving team", () => {
    expect(decideEdit({ visibility: "link", team: null, role: null, actor: "agent" })).toBe("apply");
  });

  it("should wait when the editor is no longer a member of the approving team", () => {
    expect(decideEdit({ visibility: "link", team: sharedTeam, role: null, actor: "person" })).toBe("pending");
  });
});

describe("editNeedsAuditRow", () => {
  it("should record an audit row when a shared team's approver edits a link artifact", () => {
    expect(editNeedsAuditRow({ visibility: "link", team: sharedTeam })).toBe(true);
  });

  it("should skip the audit row when the team is personal or the level is team", () => {
    expect(editNeedsAuditRow({ visibility: "public", team: personalTeam })).toBe(false);
    expect(editNeedsAuditRow({ visibility: "team", team: sharedTeam })).toBe(false);
  });
});

describe("versionToServe", () => {
  const shared = { visibility: "public" as const, approvedVersionId: "v1" };

  it("should serve the approved version when the viewer is outside the team", () => {
    expect(versionToServe({ ...shared, isAuthor: false, isTeamMember: false })).toEqual({ source: "approved", versionId: "v1" });
  });

  it("should serve the latest version when the viewer is the author", () => {
    expect(versionToServe({ ...shared, isAuthor: true, isTeamMember: false })).toEqual({ source: "latest" });
  });

  it("should serve the latest version when the viewer is a team member", () => {
    expect(versionToServe({ ...shared, isAuthor: false, isTeamMember: true })).toEqual({ source: "latest" });
  });

  it("should serve the latest version when there is no approved version yet", () => {
    expect(versionToServe({ visibility: "link", approvedVersionId: null, isAuthor: false, isTeamMember: false })).toEqual({ source: "latest" });
  });

  it("should serve the latest version when the artifact is shared with the team only", () => {
    expect(versionToServe({ visibility: "team", approvedVersionId: "v1", isAuthor: false, isTeamMember: false })).toEqual({ source: "latest" });
  });
});

describe("sameReviewedFields", () => {
  const base: ReviewedFields = { title: "T", icon: null, theme: null, cover: null, summary: "", content: "a", kind: "markdown", language: "", source: "", metadata: { a: 1 } };

  it("should treat versions as the same when only the deprecated project label differs, since projects are never reviewed", () => {
    const withLabel = { ...base, project: "Old label" };
    expect(sameReviewedFields(base, withLabel)).toBe(true);
  });

  it("should treat versions as the same when every reader-facing field matches", () => {
    expect(sameReviewedFields(base, { ...base, metadata: { a: 1 } })).toBe(true);
  });

  it("should see a change when content or metadata differs", () => {
    expect(sameReviewedFields(base, { ...base, content: "b" })).toBe(false);
    expect(sameReviewedFields(base, { ...base, metadata: { a: 2 } })).toBe(false);
  });

  it("should see a change when only the icon differs, so an icon edit goes through approval", () => {
    expect(sameReviewedFields(base, { ...base, icon: "🚀" })).toBe(false);
    expect(sameReviewedFields({ ...base, icon: "tabler:bug" }, { ...base, icon: "tabler:rocket" })).toBe(false);
    expect(sameReviewedFields({ ...base, icon: "🚀" }, { ...base, icon: "🚀" })).toBe(true);
  });

  it("should see a change when only the cover or its focal point differs, so a cover edit goes through approval", () => {
    expect(sameReviewedFields(base, { ...base, cover: "mist" })).toBe(false);
    expect(sameReviewedFields({ ...base, cover: "mist" }, { ...base, cover: "dusk" })).toBe(false);
    expect(sameReviewedFields({ ...base, cover: "file:0f8fad5b-d9cb-469f-a165-70867728950e" }, { ...base, cover: "file:0f8fad5b-d9cb-469f-a165-70867728950e@20" })).toBe(false);
    expect(sameReviewedFields({ ...base, cover: "mist" }, { ...base, cover: "mist" })).toBe(true);
  });

  it("should see a change when only the theme differs, so a theme edit goes through approval", () => {
    expect(sameReviewedFields(base, { ...base, theme: "paper" })).toBe(false);
    expect(sameReviewedFields({ ...base, theme: "paper" }, { ...base, theme: "ocean" })).toBe(false);
    expect(sameReviewedFields({ ...base, theme: "paper" }, { ...base, theme: null })).toBe(false);
  });

  it("should treat the same theme as unchanged when its JSON keys come back in another order", () => {
    const theme = presetTheme("forest");
    if (!theme) throw new Error("forest preset missing");
    const reordered = { dark: theme.dark, light: theme.light, fonts: theme.fonts, radius: theme.radius, mode: theme.mode, version: theme.version };
    expect(sameReviewedFields({ ...base, theme }, { ...base, theme: reordered })).toBe(true);
    expect(sameReviewedFields({ ...base, theme }, { ...base, theme: { ...theme, radius: "xl" } })).toBe(false);
  });
});
