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
  const { cancelOlderOpenInvitations, deleteUnsentInvitation, getInvitationRecord, isEmailInTeam, isInTeam, openInvitationRole } = await import("./invitation-queries");
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
      // An expired invitation whose newer one was removed: it must not come back.
      invite("removed-older", "removed@example.com", "pending", -5, "member", teamId, -12),
      invite("removed-newer", "removed@example.com", "canceled", -1, "member", teamId, -8),
      // Three open invitations to one address, the last one just created: the older two get canceled.
      invite("dup-1", "dup@example.com", "pending", 5, "admin", teamId, -6),
      invite("dup-2", "DUP@example.com", "pending", 5, "member", teamId, -5),
      invite("dup-new", "dup@example.com", "pending", 6, "member", teamId, -1.5),
      // A later invitation to that address, as if another request raced: never canceled by an older one.
      invite("dup-later", "dup@example.com", "pending", 7, "member", teamId, 0.5),
      invite("dup-other-team", "dup@example.com", "pending", 5, "member", otherTeam, -6),
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
    expect(await isEmailInTeam(teamId, `${owner.toUpperCase()}@EXAMPLE.COM`)).toBe(true);
    expect(await isEmailInTeam(otherTeam, `${owner}@example.com`)).toBe(false);
  });

  it("should list every open invitation, newest first, then expired ones only while they are the newest to their address", async () => {
    const rows = await listPendingInvitations(teamId, new Date(now));
    expect(rows.map((row) => [row.email, row.expired, row.role])).toEqual([
      ["dup@example.com", false, "member"],
      ["again@example.com", false, "member"],
      ["lead@example.com", false, "admin"],
      ["dup@example.com", false, "member"],
      ["ann@example.com", false, "member"],
      ["resent@example.com", false, "member"],
      ["DUP@example.com", false, "member"],
      ["dup@example.com", false, "admin"],
      ["resent@example.com", false, "admin"],
      ["late@example.com", true, "member"],
    ]);
  });

  it("should cancel only the older open invitations to the same address in the same team", async () => {
    await cancelOlderOpenInvitations(id("dup-new"));
    const states = await getDb()
      .select({ id: teamInvitation.id, status: teamInvitation.status })
      .from(teamInvitation)
      .where(inArray(teamInvitation.id, [id("dup-1"), id("dup-2"), id("dup-new"), id("dup-later"), id("dup-other-team")]));
    expect(Object.fromEntries(states.map((row) => [row.id.replace(`invq-${tag}-`, ""), row.status]))).toEqual({
      "dup-1": "canceled",
      "dup-2": "canceled",
      "dup-new": "pending",
      "dup-later": "pending",
      "dup-other-team": "pending",
    });
    expect((await listPendingInvitations(teamId, new Date(now))).filter((row) => row.email.toLowerCase() === "dup@example.com")).toHaveLength(2);
  });

  it("should delete an unsent invitation only while it is pending", async () => {
    await getDb().insert(teamInvitation).values([
      { id: id("unsent"), teamId: otherTeam, email: "typo@example.com", role: "member", status: "pending", expiresAt: at(7), inviterId: owner },
      { id: id("unsent-used"), teamId: otherTeam, email: "used@example.com", role: "member", status: "accepted", expiresAt: at(7), inviterId: owner },
    ]);

    await deleteUnsentInvitation(id("unsent"));
    await deleteUnsentInvitation(id("unsent-used"));

    const left = await getDb().select({ id: teamInvitation.id }).from(teamInvitation).where(inArray(teamInvitation.id, [id("unsent"), id("unsent-used"), id("elsewhere")]));
    expect(left.map((row) => row.id).sort()).toEqual([id("elsewhere"), id("unsent-used")].sort());
  });
});
