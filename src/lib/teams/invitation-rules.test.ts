import { describe, expect, it } from "vitest";

import { invitationPageState, invitationRefusal, inviteMode, showsTeam, teamWorkspacePath, visibleInvitations, type InvitationFacts, type InvitationViewer } from "./invitation-rules";

const now = new Date("2026-11-11T12:00:00Z");
const later = new Date("2026-11-18T12:00:00Z");
const earlier = new Date("2026-11-10T12:00:00Z");
const invite = (extra: Partial<InvitationFacts> = {}): InvitationFacts => ({ email: "Ann@Example.com", status: "pending", expiresAt: later, ...extra });
const ann: InvitationViewer = { email: "ann@example.com", emailVerified: true, isMember: false };
const bob: InvitationViewer = { email: "bob@example.com", emailVerified: true, isMember: false };

describe("invitationPageState", () => {
  it("should offer to join when the open invitation is addressed to the viewer, ignoring case", () => {
    expect(invitationPageState(invite(), ann, now)).toBe("open");
  });

  it("should say the invitation went elsewhere, and never show the team, when another account opens it", () => {
    for (const status of ["pending", "accepted", "canceled", "rejected"]) {
      const state = invitationPageState(invite({ status }), bob, now);
      expect(state).toBe("other-email");
      expect(showsTeam(state, true)).toBe(false);
    }
    expect(invitationPageState(invite({ expiresAt: earlier }), bob, now)).toBe("other-email");
  });

  it("should send a viewer who is already in the team to the team, whoever the invitation was for", () => {
    expect(invitationPageState(invite({ status: "accepted" }), { ...ann, isMember: true }, now)).toBe("member");
    expect(invitationPageState(invite(), { ...bob, isMember: true }, now)).toBe("member");
  });

  it("should name why an invitation to the viewer is closed", () => {
    expect(invitationPageState(invite({ status: "accepted" }), ann, now)).toBe("used");
    expect(invitationPageState(invite({ status: "canceled" }), ann, now)).toBe("canceled");
    expect(invitationPageState(invite({ status: "rejected" }), ann, now)).toBe("declined");
    expect(invitationPageState(invite({ expiresAt: earlier }), ann, now)).toBe("expired");
    expect(invitationPageState(invite({ expiresAt: now }), ann, now)).toBe("expired");
  });

  it("should never offer to join an expired or closed invitation", () => {
    for (const facts of [invite({ expiresAt: earlier }), invite({ status: "canceled" }), invite({ status: "accepted" }), invite({ status: "weird" })]) {
      expect(invitationPageState(facts, ann, now)).not.toBe("open");
    }
  });

  it("should ask the viewer to confirm their address when it is not verified", () => {
    expect(invitationPageState(invite(), { ...ann, emailVerified: false }, now)).toBe("verify");
  });

  it("should report a missing invitation without showing a team", () => {
    expect(invitationPageState(null, ann, now)).toBe("missing");
    expect(showsTeam("missing", true)).toBe(false);
    expect(showsTeam("expired", true)).toBe(true);
  });

  it("should hide the team from an unconfirmed account even when its email matches, in every state", () => {
    const unconfirmed = { ...ann, emailVerified: false };
    for (const facts of [invite(), invite({ expiresAt: earlier }), invite({ status: "canceled" }), invite({ status: "accepted" }), invite({ status: "rejected" })]) {
      const state = invitationPageState(facts, unconfirmed, now);
      expect(showsTeam(state, unconfirmed.emailVerified), state).toBe(false);
    }
  });

  it("should show the team to a member whether or not their address is confirmed", () => {
    expect(showsTeam("member", false)).toBe(true);
  });
});

describe("inviteMode", () => {
  it("should create when nothing is open, resend at the same role, and replace at another role", () => {
    expect(inviteMode(null, "member")).toBe("new");
    expect(inviteMode("member", "member")).toBe("resend");
    expect(inviteMode("member", "admin")).toBe("replace");
  });
});

describe("invitationRefusal", () => {
  it("should name the address when the person is already in the team", () => {
    expect(invitationRefusal("USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", "ann@example.com")).toBe("ann@example.com is already in this team.");
  });

  it("should explain a full team and an unconfirmed address in plain words", () => {
    expect(invitationRefusal("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")).toMatch(/full/);
    expect(invitationRefusal("EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION")).toMatch(/Confirm your email/);
  });

  it("should keep the default message for codes it does not know", () => {
    expect(invitationRefusal(undefined)).toBeNull();
    expect(invitationRefusal("SOMETHING_ELSE")).toBeNull();
  });
});

describe("teamWorkspacePath", () => {
  it("should open the team's workspace, not its settings page", () => {
    expect(teamWorkspacePath("north-wind")).toBe("/app?team=north-wind");
  });
});

describe("visibleInvitations", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, n));
  const row = (email: string, created: number, expired: boolean) => ({ email, createdAt: day(created), expired });
  const newest = (entries: [string, number][]) => new Map(entries.map(([email, created]) => [email, day(created)]));

  it("should show every open invitation, even two to the same address, so the inviter can cancel either", () => {
    const rows = [row("ann@example.com", 3, false), row("ann@example.com", 5, false)];
    expect(visibleInvitations(rows, newest([["ann@example.com", 5]])).map((item) => item.createdAt)).toEqual([day(5), day(3)]);
  });

  it("should show an expired invitation only while it is the newest one to that address", () => {
    const rows = [row("late@example.com", 2, true), row("late@example.com", 1, true), row("again@example.com", 1, true), row("again@example.com", 4, false)];
    const shown = visibleInvitations(rows, newest([["late@example.com", 2], ["again@example.com", 4]]));
    expect(shown.map((item) => [item.email, item.createdAt.getUTCDate()])).toEqual([["again@example.com", 4], ["late@example.com", 2]]);
  });

  it("should not bring an older expired invitation back when the newest one was removed", () => {
    const rows = [row("gone@example.com", 1, true)];
    // The newest invitation to this address (day 2) was canceled, so it is not in rows.
    expect(visibleInvitations(rows, newest([["gone@example.com", 2]]))).toEqual([]);
  });

  it("should match addresses whatever their letter case", () => {
    expect(visibleInvitations([row("Late@Example.com", 2, true)], newest([["late@example.com", 2]]))).toHaveLength(1);
  });
});
