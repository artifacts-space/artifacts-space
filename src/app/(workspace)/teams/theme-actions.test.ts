import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamMembership } from "@/lib/teams/queries";
import { defaultActor } from "@/lib/teams/capability-rules";

/*
 * Team theme actions: only owners and admins of a shared team may change
 * presets or the team default. Each refusal is checked to fail closed, and
 * the store is never reached when access is refused. The session, the
 * membership lookup, and the store are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  createTeamPreset: vi.fn(),
  updateTeamPreset: vi.fn(),
  duplicateTeamPreset: vi.fn(),
  deleteTeamPreset: vi.fn(),
  setTeamDefaultTheme: vi.fn(),
  countArtifactsUsingPreset: vi.fn(),
  restorePresetRevision: vi.fn(),
  restoreDefaultRevision: vi.fn(),
  listPresetRevisions: vi.fn(),
  listDefaultRevisions: vi.fn(),
  newArtifactThemeChoices: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({ getTeamMembershipById: mocks.membership }));
vi.mock("@/lib/themes/team-presets", () => ({
  createTeamPreset: mocks.createTeamPreset,
  updateTeamPreset: mocks.updateTeamPreset,
  duplicateTeamPreset: mocks.duplicateTeamPreset,
  deleteTeamPreset: mocks.deleteTeamPreset,
  setTeamDefaultTheme: mocks.setTeamDefaultTheme,
  countArtifactsUsingPreset: mocks.countArtifactsUsingPreset,
  restorePresetRevision: mocks.restorePresetRevision,
  restoreDefaultRevision: mocks.restoreDefaultRevision,
}));
vi.mock("@/lib/themes/team-theme-revisions", () => ({ listPresetRevisions: mocks.listPresetRevisions, listDefaultRevisions: mocks.listDefaultRevisions }));
vi.mock("@/lib/themes/theme-choices", () => ({ newArtifactThemeChoices: mocks.newArtifactThemeChoices }));

const actions = await import("./theme-actions");

function membership(role: TeamMembership["role"], personal = false): TeamMembership {
  return { id: "team-1", slug: "acme", name: "Acme", personal, teamSharingNeedsApproval: true, createdBy: "owner-1", role, memberId: "m-1", userId: "viewer-1", ...defaultActor(role), roleName: role, capabilities: [...defaultActor(role).capabilities], iconUrl: null };
}

const input = { name: "Brand", description: "", theme: { version: 1 } };

/** Every change action, called with the same team. */
const changes = {
  create: () => actions.createTeamPresetAction("team-1", input),
  update: () => actions.updateTeamPresetAction("team-1", "preset-1", input),
  duplicate: () => actions.duplicateTeamPresetAction("team-1", "preset-1"),
  delete: () => actions.deleteTeamPresetAction("team-1", "preset-1"),
  setDefault: () => actions.setTeamDefaultThemeAction("team-1", "paper"),
  usage: () => actions.presetUsageAction("team-1", "preset-1"),
  presetHistory: () => actions.presetRevisionsAction("team-1", "preset-1"),
  defaultHistory: () => actions.defaultRevisionsAction("team-1"),
  restorePreset: () => actions.restorePresetRevisionAction("team-1", "preset-1", "rev-1"),
  restoreDefault: () => actions.restoreDefaultRevisionAction("team-1", "rev-2"),
};

function storeCalls() {
  return [
    mocks.createTeamPreset,
    mocks.updateTeamPreset,
    mocks.duplicateTeamPreset,
    mocks.deleteTeamPreset,
    mocks.setTeamDefaultTheme,
    mocks.countArtifactsUsingPreset,
    mocks.restorePresetRevision,
    mocks.restoreDefaultRevision,
    mocks.listPresetRevisions,
    mocks.listDefaultRevisions,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("team theme actions", () => {
  it.each(Object.entries(changes))("should refuse a plain member when they call %s", async (_name, run) => {
    mocks.membership.mockResolvedValue(membership("member"));
    const result = await run();
    expect(result).toEqual({ success: false, error: "Only team owners and admins can change the team's themes." });
    expect(storeCalls()).toBe(0);
  });

  it.each(Object.entries(changes))("should answer team not found to someone outside the team when they call %s", async (_name, run) => {
    mocks.membership.mockResolvedValue(null);
    expect(await run()).toEqual({ success: false, error: "Team not found." });
    expect(storeCalls()).toBe(0);
  });

  it("should refuse an owner of a personal team, which has no team themes", async () => {
    mocks.membership.mockResolvedValue(membership("owner", true));
    expect((await changes.create()).success).toBe(false);
    expect(storeCalls()).toBe(0);
  });

  it("should refuse when the session has ended", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await changes.setDefault()).toEqual({ success: false, error: "Your session ended. Sign in again." });
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it("should let an admin create a preset in their own team only", async () => {
    mocks.membership.mockResolvedValue(membership("admin"));
    mocks.createTeamPreset.mockResolvedValue({ id: "preset-1", ref: "team:brand-abc234" });
    const result = await changes.create();
    expect(result.success).toBe(true);
    expect(mocks.membership).toHaveBeenCalledWith("user-1", "team-1");
    expect(mocks.createTeamPreset).toHaveBeenCalledWith("team-1", "user-1", input);
  });

  it("should record who set the team default when an owner sets it", async () => {
    mocks.membership.mockResolvedValue(membership("owner"));
    mocks.setTeamDefaultTheme.mockResolvedValue("paper");
    expect(await changes.setDefault()).toEqual({ success: true, data: "paper" });
    expect(mocks.setTeamDefaultTheme).toHaveBeenCalledWith("team-1", "user-1", "paper");
  });

  it("should restore a preset revision and the team default only within the manager's own team", async () => {
    mocks.membership.mockResolvedValue(membership("admin"));
    mocks.restorePresetRevision.mockResolvedValue({ id: "preset-1" });
    mocks.restoreDefaultRevision.mockResolvedValue("paper");
    expect((await changes.restorePreset()).success).toBe(true);
    expect(mocks.restorePresetRevision).toHaveBeenCalledWith("team-1", "preset-1", "rev-1", "user-1");
    expect(await changes.restoreDefault()).toEqual({ success: true, data: "paper" });
    expect(mocks.restoreDefaultRevision).toHaveBeenCalledWith("team-1", "rev-2", "user-1");
  });

  it("should give no team presets for a new artifact when signed out", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await actions.newArtifactThemeChoicesAction()).toEqual({ success: true, data: { groups: [], inherited: null, manageable: [] } });
    expect(mocks.newArtifactThemeChoices).not.toHaveBeenCalled();
  });
});
