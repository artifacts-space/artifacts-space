import { describe, expect, it } from "vitest";

import { searchChangeAfterSave, searchSwitchState } from "./search-options";
import type { ShareTeam } from "./share-teams-context";
import { defaultActor } from "@/lib/teams/capability-rules";

const personal: ShareTeam = { id: "p", slug: "me", name: "Me", personal: true, role: "owner", ...defaultActor("owner"), teamSharingNeedsApproval: false };
const strict: ShareTeam = { id: "s", slug: "strict", name: "Strict", personal: false, role: "member", ...defaultActor("member"), teamSharingNeedsApproval: true };

describe("searchSwitchState", () => {
  it("should hide the switch when the person chooses anything but public", () => {
    for (const visibility of ["private", "team", "link"] as const) expect(searchSwitchState({ current: "public", visibility, team: personal })).toBe("hidden");
  });

  it("should offer the switch when the artifact is public already", () => {
    expect(searchSwitchState({ current: "public", visibility: "public", team: strict })).toBe("available");
  });

  it("should offer the switch when public sharing applies as soon as they save", () => {
    expect(searchSwitchState({ current: "link", visibility: "public", team: personal })).toBe("available");
  });

  it("should hide the switch when no team is chosen to approve public sharing", () => {
    expect(searchSwitchState({ current: "private", visibility: "public", team: undefined })).toBe("hidden");
  });

  it("should wait for approval when public sharing needs an owner's or admin's approval", () => {
    expect(searchSwitchState({ current: "private", visibility: "public", team: strict })).toBe("after-approval");
  });
});

describe("searchChangeAfterSave", () => {
  it("should change the setting when the artifact is public after saving and the choice differs", () => {
    expect(searchChangeAfterSave({ state: "available", savedVisibility: "public", saved: false, chosen: true })).toBe(true);
  });

  it("should not change the setting when the public sharing is still waiting for approval", () => {
    expect(searchChangeAfterSave({ state: "available", savedVisibility: "link", saved: false, chosen: true })).toBe(false);
    expect(searchChangeAfterSave({ state: "after-approval", savedVisibility: "private", saved: false, chosen: true })).toBe(false);
  });

  it("should not call the server when the choice matches what is saved", () => {
    expect(searchChangeAfterSave({ state: "available", savedVisibility: "public", saved: true, chosen: true })).toBe(false);
  });
});
