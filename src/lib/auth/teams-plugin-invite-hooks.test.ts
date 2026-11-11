import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The invitation hooks: the create hook always checks the role, counts the
 * limits only when the call was not already checked by inviteMemberAction
 * (invite-precheck.ts), and a new invitation cancels the older open ones to
 * the same address. The guards, limits, and database write are mocked at
 * their boundaries.
 */

const mocks = vi.hoisted(() => ({
  assertCanInviteAs: vi.fn(),
  assertCanInvite: vi.fn(),
  cancelOlderOpenInvitations: vi.fn(),
}));

vi.mock("@/lib/teams/guards", async (importOriginal) => ({ ...(await importOriginal<object>()), assertCanInviteAs: mocks.assertCanInviteAs }));
vi.mock("@/lib/teams/invitation-limits", () => ({ assertCanInvite: mocks.assertCanInvite, assertCanCreateTeam: vi.fn() }));
vi.mock("@/lib/teams/invitation-queries", () => ({ cancelOlderOpenInvitations: mocks.cancelOlderOpenInvitations }));

const { teamsPlugin } = await import("./teams-plugin");
const { withPrecheckedInvite } = await import("@/lib/teams/invite-precheck");

interface InviteHooks {
  beforeCreateInvitation: (data: unknown) => Promise<unknown>;
  afterCreateInvitation: (data: unknown) => Promise<unknown>;
}

function hooks(): InviteHooks {
  const plugin = teamsPlugin() as unknown as { options: { organizationHooks: InviteHooks } };
  return plugin.options.organizationHooks;
}

const call = {
  invitation: { id: "inv-1", role: "member", email: "ann@example.com" },
  inviter: { id: "viewer-1" },
  organization: { id: "team-1", personal: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertCanInviteAs.mockResolvedValue(undefined);
  mocks.assertCanInvite.mockResolvedValue(undefined);
  mocks.cancelOlderOpenInvitations.mockResolvedValue(undefined);
});

describe("beforeCreateInvitation", () => {
  it("should count the limits when the call was not checked first", async () => {
    await hooks().beforeCreateInvitation(call);
    expect(mocks.assertCanInviteAs).toHaveBeenCalledWith("viewer-1", "team-1", "member");
    expect(mocks.assertCanInvite).toHaveBeenCalledWith("viewer-1", "team-1");
  });

  it("should still refuse at the limits when the marker names another inviter or team", async () => {
    mocks.assertCanInvite.mockRejectedValue(new Error("limit"));
    await expect(withPrecheckedInvite({ inviterId: "someone-else", teamId: "team-1" }, () => hooks().beforeCreateInvitation(call))).rejects.toThrow("limit");
    await expect(withPrecheckedInvite({ inviterId: "viewer-1", teamId: "team-2" }, () => hooks().beforeCreateInvitation(call))).rejects.toThrow("limit");
  });

  it("should check the role but not count the limits again inside a checked call", async () => {
    await withPrecheckedInvite({ inviterId: "viewer-1", teamId: "team-1" }, () => hooks().beforeCreateInvitation(call));
    expect(mocks.assertCanInviteAs).toHaveBeenCalledTimes(1);
    expect(mocks.assertCanInvite).not.toHaveBeenCalled();
  });

  it("should refuse a personal team and an Owner invitation whatever the marker says", async () => {
    const checked = (data: unknown) => withPrecheckedInvite({ inviterId: "viewer-1", teamId: "team-1" }, () => hooks().beforeCreateInvitation(data));
    await expect(checked({ ...call, organization: { id: "team-1", personal: true } })).rejects.toThrow();
    await expect(checked({ ...call, invitation: { ...call.invitation, role: "owner" } })).rejects.toThrow();
  });
});

describe("afterCreateInvitation", () => {
  it("should cancel the older open invitations to the same address", async () => {
    await hooks().afterCreateInvitation(call);
    expect(mocks.cancelOlderOpenInvitations).toHaveBeenCalledWith("inv-1");
  });
});
