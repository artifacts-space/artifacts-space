import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultActor } from "@/lib/teams/capability-rules";
import type { TeamMembership } from "@/lib/teams/queries";

/*
 * Team icon actions: only people whose role may change team settings, in a
 * shared team, may upload or remove the icon. Every refusal fails closed and
 * never reaches storage. The session, the membership lookup, the rate limit,
 * and the store are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  saveTeamIcon: vi.fn(),
  removeTeamIcon: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({ getTeamAccessById: mocks.access }));
vi.mock("@/lib/teams/team-icon", () => ({ saveTeamIcon: mocks.saveTeamIcon, removeTeamIcon: mocks.removeTeamIcon }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

const { removeTeamIconAction, uploadTeamIconAction } = await import("./icon-actions");

function membership(overrides: Partial<TeamMembership> = {}): TeamMembership {
  return { id: "team-1", slug: "acme", name: "Acme", personal: false, teamSharingNeedsApproval: true, createdBy: "owner-1", role: "owner", memberId: "m-1", userId: "viewer-1", ...defaultActor("owner"), roleName: "Owner", iconUrl: null, ...overrides };
}

function actingAs(overrides: Partial<TeamMembership>) {
  mocks.access.mockResolvedValue({ membership: membership(overrides), roles: new Map() });
}

function form(): FormData {
  const data = new FormData();
  data.set("icon", new File([new Uint8Array([1, 2, 3])], "team-icon.png", { type: "image/png" }));
  return data;
}

const denied = { success: false, error: "Only people who can change team settings can change the team icon." };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer-1" } });
});

describe("uploadTeamIconAction", () => {
  it("should store the icon for an owner of a shared team", async () => {
    actingAs({});
    expect(await uploadTeamIconAction("team-1", form())).toEqual({ success: true, data: null });
    expect(mocks.saveTeamIcon).toHaveBeenCalledWith("team-1", expect.any(Uint8Array));
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("fileUpload", "viewer-1");
  });

  it("should store the icon for a custom role that holds change team settings", async () => {
    actingAs({ role: "member", roleKey: "brand", roleName: "Brand", capabilities: ["settings.team"] });
    expect((await uploadTeamIconAction("team-1", form())).success).toBe(true);
  });

  it.each(["admin", "member"] as const)("should refuse a %s without change team settings and store nothing", async (role) => {
    actingAs({ ...defaultActor(role), role, roleName: role });
    expect(await uploadTeamIconAction("team-1", form())).toEqual(denied);
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });

  it("should refuse an agent even when its membership says owner", async () => {
    actingAs({ kind: "agent" });
    expect(await uploadTeamIconAction("team-1", form())).toEqual(denied);
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });

  it("should refuse the owner of a personal team", async () => {
    actingAs({ personal: true });
    expect(await uploadTeamIconAction("team-1", form())).toEqual(denied);
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });

  it("should answer team not found to someone outside the team", async () => {
    mocks.access.mockResolvedValue(null);
    expect(await uploadTeamIconAction("team-1", form())).toEqual({ success: false, error: "Team not found." });
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });

  it("should refuse a form without a file before reading anything", async () => {
    actingAs({});
    expect(await uploadTeamIconAction("team-1", new FormData())).toEqual({ success: false, error: "Pick an image to upload." });
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });

  it("should refuse a file over 512 KB before reading it", async () => {
    actingAs({});
    const data = new FormData();
    data.set("icon", new File([new Uint8Array(524_289)], "big.png", { type: "image/png" }));
    expect(await uploadTeamIconAction("team-1", data)).toEqual({ success: false, error: "The icon can be at most 512 KB." });
    expect(mocks.saveTeamIcon).not.toHaveBeenCalled();
  });
});

describe("removeTeamIconAction", () => {
  it("should remove the icon for an owner", async () => {
    actingAs({});
    expect(await removeTeamIconAction("team-1")).toEqual({ success: true, data: null });
    expect(mocks.removeTeamIcon).toHaveBeenCalledWith("team-1");
  });

  it.each(["admin", "member"] as const)("should refuse a %s without change team settings", async (role) => {
    actingAs({ ...defaultActor(role), role, roleName: role });
    expect(await removeTeamIconAction("team-1")).toEqual(denied);
    expect(mocks.removeTeamIcon).not.toHaveBeenCalled();
  });
});
