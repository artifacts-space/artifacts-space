import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The invitation reads against a real Postgres: the open invitation a
 * re-invite would resend (only pending, unexpired, any letter case), the
 * record behind the invitation page, membership, and the inviter's list of
 * unanswered invitations (open first, expired ones for 30 days, one row per
 * address). Runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("invitation queries with a database", async () => {
  const { inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { team, teamInvitation, teamMember, user } = await import("@/db/schema");
  const { getInvitationRecord, isInTeam, openInvitationRole } = await import("./invitation-queries");
  const { listPendingInvitations } = await import("./queries");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `invq-${tag}-${name}`;
  const teamId = id("team");
  const otherTeam = id("other");
  const owner = id("owner");
  const day = 86_400_000;
  const now = Date.now();
  const at = (days: number) => new Date(now + days * day);

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([{ id: owner, name: "Owner", email: `${owner}@example.com` }]);
    await db.insert(team).values([
      { id: teamId, name: "Invite team", slug: teamId, personal: false },
      { id: otherTeam, name: "Other team", slug: otherTeam, personal: false },
    ]);
    await db.insert(teamMember).values([{ id: id("m-owner"), teamId, userId: owner, role: "owner" }]);
    const invite = (name: string, email: string, status: string, expiresIn: number, role = "member", team = teamId, createdIn = expiresIn - 7) =>
      ({ id: id(name), teamId: team, email, role, status, expiresAt: at(expiresIn), inviterId: owner, createdAt: at(createdIn) });
    await db.insert(teamInvitation).values([
      invite("open", "ann@example.com", "pending", 5),
      invite("open-admin", "lead@example.com", "pending", 6, "admin"),
      invite("expired-recent", "late@example.com", "pending", -3),
      invite("expired-old", "gone@example.com", "pending", -40),
      invite("canceled", "cancel@example.com", "canceled", 5),
      invite("accepted", "joined@example.com", "accepted", 5),
      // An address that expired, then got a fresh invitation: only the fresh one shows.
      invite("again-old", "again@example.com", "pending", -2),
      invite("again-new", "again@example.com", "pending", 7),
      // Two open rows for one address, the older one resent so it expires later: the one created last is shown.
      invite("resent-older", "resent@example.com", "pending", 6.9, "admin", teamId, -20),
      invite("resent-newer", "resent@example.com", "pending", 4, "member", teamId, -3),
      invite("elsewhere", "ann@example.com", "pending", 5, "member", otherTeam),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(team).where(inArray(team.id, [teamId, otherTeam]));
    await db.delete(user).where(inArray(user.id, [owner]));
  });

  it("should find the open invitation's role whatever the letter case, and only in this team", async () => {
    expect(await openInvitationRole(teamId, "ANN@example.com")).toBe("member");
    expect(await openInvitationRole(teamId, "lead@example.com")).toBe("admin");
  });

  it("should find no open invitation when it expired, was canceled, or was used", async () => {
    expect(await openInvitationRole(teamId, "late@example.com")).toBeNull();
    expect(await openInvitationRole(teamId, "cancel@example.com")).toBeNull();
    expect(await openInvitationRole(teamId, "joined@example.com")).toBeNull();
    expect(await openInvitationRole(teamId, "nobody@example.com")).toBeNull();
  });

  it("should load an invitation in any state with its team and inviter", async () => {
    const record = await getInvitationRecord(id("canceled"));
    expect(record).toMatchObject({ status: "canceled", email: "cancel@example.com", teamId, teamName: "Invite team", inviterId: owner, inviterName: "Owner", role: "member" });
    expect(await getInvitationRecord(id("no-such"))).toBeNull();
  });

  it("should tell members from everyone else", async () => {
    expect(await isInTeam(owner, teamId)).toBe(true);
    expect(await isInTeam(owner, otherTeam)).toBe(false);
  });

  it("should list open invitations first, then ones expired in the last 30 days, one per address, newest created first", async () => {
    const rows = await listPendingInvitations(teamId, new Date(now));
    expect(rows.map((row) => [row.email, row.expired, row.role])).toEqual([
      ["again@example.com", false, "member"],
      ["lead@example.com", false, "admin"],
      ["ann@example.com", false, "member"],
      ["resent@example.com", false, "member"],
      ["late@example.com", true, "member"],
    ]);
  });
});
