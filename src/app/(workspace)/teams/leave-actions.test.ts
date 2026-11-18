import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamMembership } from "@/lib/teams/queries";

/*
 * The leave preview and "Move to Personal first" on the server. Every refusal
 * (no session, not a member, a personal team, bad input) must stop before the
 * departure service is reached, and the service is always handed the
 * membership's own team and user ids, never ids the browser chose. The
 * session, the membership lookup, and the service are mocked at their
 * boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  preview: vi.fn(),
  move: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({
  getTeamAccessById: async (userId: string, teamId: string) => {
    const membership: unknown = await mocks.membership(userId, teamId);
    return membership ? { membership, roles: new Map() } : null;
  },
}));
vi.mock("@/lib/teams/departure", () => ({ leavePreviewFor: mocks.preview, moveOwnTeamArtifactsToPersonal: mocks.move }));

const actions = await import("./leave-actions");

function membership(overrides: Partial<TeamMembership> = {}): TeamMembership {
  return { id: "team-1", slug: "acme", name: "Acme", personal: false, teamSharingNeedsApproval: true, createdBy: "owner-1", role: "member", memberId: "m-viewer", userId: "viewer-1", roleKey: "member", roleName: "Member", kind: "person", capabilities: [], iconUrl: null, ...overrides };
}

const emptyPreview = { total: 0, artifacts: [], heir: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer-1" } });
  mocks.membership.mockResolvedValue(membership());
  mocks.preview.mockResolvedValue(emptyPreview);
  mocks.move.mockResolvedValue({ outcome: { moved: [], waiting: [], refused: [] }, preview: emptyPreview });
  // redirect() throws in Next; the stand-in does the same so nothing runs after it.
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe("leavePreviewAction", () => {
  it("should list the viewer's own artifacts in the team they are a member of", async () => {
    await expect(actions.leavePreviewAction("team-1")).resolves.toEqual({ success: true, data: emptyPreview });
    expect(mocks.membership).toHaveBeenCalledWith("viewer-1", "team-1");
    expect(mocks.preview).toHaveBeenCalledWith("team-1", "viewer-1");
  });

  it("should refuse when the viewer is not in the team", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(actions.leavePreviewAction("team-2")).resolves.toEqual({ success: false, error: "Team not found." });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("should refuse the viewer's personal team, which nobody leaves", async () => {
    mocks.membership.mockResolvedValue(membership({ personal: true }));
    await expect(actions.leavePreviewAction("team-1")).resolves.toMatchObject({ success: false });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("should refuse when nobody is signed in", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(actions.leavePreviewAction("team-1")).resolves.toMatchObject({ success: false });
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in");
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});

describe("moveToPersonalBeforeLeavingAction", () => {
  it("should move with the membership's own team and user ids", async () => {
    mocks.membership.mockResolvedValue(membership({ id: "team-1", userId: "viewer-1" }));
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", ["a-1", "a-2"])).resolves.toMatchObject({ success: true });
    expect(mocks.move).toHaveBeenCalledWith({ teamId: "team-1", userId: "viewer-1", ids: ["a-1", "a-2"] });
  });

  it("should refuse an empty choice and too many ids before the service runs", async () => {
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", [])).resolves.toEqual({ success: false, error: "Choose an artifact to move." });
    const tooMany = Array.from({ length: 101 }, (_, index) => `a-${String(index)}`);
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", tooMany)).resolves.toMatchObject({ success: false });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("should refuse an id that is not text", async () => {
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", [42 as unknown as string])).resolves.toMatchObject({ success: false });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("should move nothing in a team the viewer is not in", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(actions.moveToPersonalBeforeLeavingAction("someone-elses", ["a-1"])).resolves.toEqual({ success: false, error: "Team not found." });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("should move nothing for an agent's membership", async () => {
    mocks.membership.mockResolvedValue(membership({ kind: "agent", roleKey: "agent" }));
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", ["a-1"])).resolves.toMatchObject({ success: false });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("should say the move failed, in plain words, when the service throws", async () => {
    mocks.move.mockRejectedValue(new Error("connection reset"));
    await expect(actions.moveToPersonalBeforeLeavingAction("team-1", ["a-1"])).resolves.toEqual({ success: false, error: "Your artifacts could not be moved. Please try again." });
  });
});
