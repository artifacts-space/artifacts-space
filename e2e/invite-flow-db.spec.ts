import { expect, test, type Page } from "@playwright/test";

import { storedText } from "./support/inline-edit-db";
import { closeInviteDb, invitationState, leaveTestTeam, openInvitations, seedInvitation, storedTeamRole, waitingReviews } from "./support/invite-db";
import {
  addTestMember,
  cleanUp,
  createTestArtifact,
  createTestTeam,
  createTestUser,
  deleteTestTeams,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  readyDevUser,
  shareTestArtifact,
} from "./support/local-db";

/**
 * Inviting two people as editors, end to end, against a local throwaway
 * database: the invited person accepts, lands in the team's workspace with
 * a welcome, and edits a team artifact with no approval; the inviter sends,
 * resends, re-roles, copies, and cancels invitations; and every dead end
 * (another account, expired, canceled, already a member, unknown link) says
 * what happened and offers the way on. Runs on phone and desktop. Emails are
 * printed by the dev server, never sent.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };
const devEmail = "dev@artifacts.space";
const seeded = { publicIds: [] as string[], teamIds: [] as string[], userIds: [] as string[] };

test.afterAll(async () => {
  await closeInviteDb();
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, seeded.userIds);
});

async function signInAsDev(page: Page): Promise<string> {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

/** A shared team owned by a seeded @example.com person, who invites. */
async function teamOwnedBySomeoneElse() {
  const ownerId = await createTestUser();
  seeded.userIds.push(ownerId);
  const team = await createTestTeam(ownerId, "owner");
  seeded.teamIds.push(team.id);
  return { ownerId, team, teamName: `Theme team ${team.id.slice(0, 4)}` };
}

test("should take an invited person from the invitation to editing a team artifact with no approval", async ({ page }, testInfo) => {
  const devId = await signInAsDev(page);
  const { ownerId, team, teamName } = await teamOwnedBySomeoneElse();
  const title = `Team brief ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await createTestArtifact({ userId: ownerId, title, content: "# Brief\n\nFirst draft.", visibility: "private", theme: null });
  seeded.publicIds.push(publicId);
  await shareTestArtifact(publicId, team.id, "team");
  const invitationId = await seedInvitation({ teamId: team.id, inviterId: ownerId, email: devEmail, role: "member" });

  await page.goto(`/invitations/${invitationId}`);
  await expect(page.getByRole("heading", { name: `Join ${teamName}` })).toBeVisible();
  await expect(page.getByText(/invited you as member\. You can edit the team's artifacts as soon as you join/)).toBeVisible();
  await page.getByRole("button", { name: "Join team" }).click();

  // Lands in the team's workspace, not a settings page, with a welcome that states the rule.
  await page.waitForURL(new RegExp(`/app\\?team=${team.slug}$`));
  const welcome = page.locator("[data-sonner-toast]").filter({ hasText: `Welcome to ${teamName}` });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("You can edit the team's artifacts right away. Sharing by link or in public needs approval from an owner or admin.");
  expect(await storedTeamRole(team.id, devId)).toBe("member");
  expect((await invitationState(invitationId)).status).toBe("accepted");
  if (testInfo.project.name === "desktop") await expect(page.locator("[data-slot=artifact-list]").getByRole("button", { name: new RegExp(title) })).toBeVisible();

  // Edits the team artifact in place: it saves at once and nothing waits for approval.
  await page.goto(`/artifact/${publicId}`);
  await page.getByRole("textbox", { name: "Artifact content" }).getByText("First draft.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited by the new member.");
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", savedWithin);
  expect((await storedText(publicId)).content).toContain("First draft. Edited by the new member.");
  expect(await waitingReviews(publicId)).toBe(0);

  // The team page states the same rule.
  await page.goto(`/teams/${team.slug}`);
  const rule = page.locator("[data-slot=team-rule]");
  await expect(rule.getByRole("heading", { name: "How this team works" })).toBeVisible();
  await expect(rule).toContainText("Edit the team's artifacts directly. Your changes save at once, with no approval.");
  await leaveTestTeam(team.id, devId);
});

test("should send two invitations from one dialog, resend one, change its role, and copy its link", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const devId = await signInAsDev(page);
  const team = await createTestTeam(devId, "owner");
  seeded.teamIds.push(team.id);
  const first = `editor-one-${testInfo.project.name}-${team.id.slice(0, 6)}@example.com`;
  const second = `editor-two-${testInfo.project.name}-${team.id.slice(0, 6)}@example.com`;

  await page.goto(`/teams/${team.slug}`);
  await page.getByRole("button", { name: "Invite people" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await expect(dialog).toContainText("They can edit the team's artifacts as soon as they join.");
  await expect(dialog.locator("#invite-role-hint")).toHaveText("Edits the team's artifacts and asks before sharing outside the team.");
  await dialog.getByLabel("Email").fill(first);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("list", { name: "Invitations sent" })).toContainText(`Sent to ${first}`);
  await expect(dialog.getByLabel("Email")).toHaveValue("");

  // The dialog stays open for the second person.
  await dialog.getByLabel("Email").fill(second);
  await dialog.getByRole("button", { name: "Send another" }).click();
  await expect(dialog.getByRole("list", { name: "Invitations sent" })).toContainText(`Sent to ${second}`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  const rows = page.getByRole("table", { name: "Members" }).locator("[data-member-row=invitation]");
  await expect(rows).toHaveCount(2);
  const [before] = await openInvitations(team.id, first);

  // Resend keeps the same link and gives it a fresh week.
  await page.getByRole("button", { name: `Actions for the invitation to ${first}` }).click();
  await page.getByRole("menuitem", { name: "Resend" }).click();
  await expect(page.getByText("Invitation sent again.")).toBeVisible();
  const resent = await openInvitations(team.id, first);
  expect(resent).toHaveLength(1);
  expect(resent[0]?.id).toBe(before?.id);
  expect(resent[0]?.expiresAt.getTime()).toBeGreaterThan(before?.expiresAt.getTime() ?? Infinity);

  // Inviting the same address as Admin replaces the invitation instead of silently keeping Member.
  await page.getByRole("button", { name: "Invite people" }).click();
  await dialog.getByLabel("Email").fill(first);
  await dialog.getByRole("combobox", { name: "Role for the invited person" }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect(dialog.locator("#invite-role-hint")).toContainText("Also invites people, approves sharing, adds agents.");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("list", { name: "Invitations sent" })).toContainText(`Sent to ${first}`);
  const replaced = await openInvitations(team.id, first);
  expect(replaced.map((row) => row.role)).toEqual(["admin"]);
  if (before) expect((await invitationState(before.id)).status).toBe("canceled");
  await page.keyboard.press("Escape");

  // Copy the link of the open invitation.
  await page.getByRole("button", { name: `Actions for the invitation to ${second}` }).click();
  await page.getByRole("menuitem", { name: "Copy invitation link" }).click();
  await expect(page.getByText("Invitation link copied. It works only for this address.")).toBeVisible();
  const [secondInvite] = await openInvitations(team.id, second);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/invitations/${secondInvite?.id ?? "missing"}$`));

  // Inviting someone already in the team names them instead of a raw error.
  await page.getByRole("button", { name: "Invite people" }).click();
  await dialog.getByLabel("Email").fill(devEmail);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`${devEmail} is already in this team.`)).toBeVisible();
});

test("should keep an expired invitation in view for the inviter and offer a new one", async ({ page }) => {
  const devId = await signInAsDev(page);
  const team = await createTestTeam(devId, "owner");
  seeded.teamIds.push(team.id);
  await seedInvitation({ teamId: team.id, inviterId: devId, email: "late-reply@example.com", expiresInDays: -2 });

  await page.goto(`/teams/${team.slug}`);
  const row = page.getByRole("table", { name: "Members" }).locator("[data-member-row=invitation]");
  await expect(row).toHaveAttribute("data-expired", "true");
  await expect(row).toContainText("Expired");
  await page.getByRole("button", { name: "Actions for the invitation to late-reply@example.com" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy invitation link" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Send a new invitation" }).click();
  await expect(page.getByText("New invitation sent.")).toBeVisible();
  await expect(row).not.toHaveAttribute("data-expired", "true");
  expect(await openInvitations(team.id, "late-reply@example.com")).toHaveLength(1);
});

test("should explain an invitation for another address and let the person switch accounts", async ({ page }) => {
  await signInAsDev(page);
  const { ownerId, team, teamName } = await teamOwnedBySomeoneElse();
  const invitationId = await seedInvitation({ teamId: team.id, inviterId: ownerId, email: `someone-${team.id.slice(0, 6)}@example.com` });

  await page.goto(`/invitations/${invitationId}`);
  await expect(page.getByRole("heading", { name: "This invitation is for another email address" })).toBeVisible();
  await expect(page.getByText(`You are signed in as ${devEmail}.`)).toBeVisible();
  // The team stays hidden from an account the invitation was not sent to.
  await expect(page.getByText(teamName)).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in with another email" }).click();
  await page.waitForURL(new RegExp(`/sign-in\\?next=%2Finvitations%2F${invitationId}$`));
  await expect(page.locator("[data-slot=invitation-hint]")).toHaveText("Use the email address your invitation went to. You come back to the invitation after you sign in.");
  expect((await invitationState(invitationId)).status).toBe("pending");
});

test("should say why a closed invitation cannot be used, and open the team for someone already in it", async ({ page }) => {
  const devId = await signInAsDev(page);
  const { ownerId, team, teamName } = await teamOwnedBySomeoneElse();
  const expired = await seedInvitation({ teamId: team.id, inviterId: ownerId, email: devEmail, expiresInDays: -1 });
  const canceled = await seedInvitation({ teamId: team.id, inviterId: ownerId, email: devEmail, status: "canceled" });

  await page.goto(`/invitations/${expired}`);
  await expect(page.getByRole("heading", { name: "This invitation expired" })).toBeVisible();
  await expect(page.getByText(`invited you to ${teamName}, but the link stopped working after 7 days`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Join team" })).toHaveCount(0);

  await page.goto(`/invitations/${canceled}`);
  await expect(page.getByRole("heading", { name: "This invitation was canceled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join team" })).toHaveCount(0);

  await page.goto("/invitations/no-such-invitation");
  await expect(page.getByRole("heading", { name: "We could not find this invitation" })).toBeVisible();

  await addTestMember(team.id, devId, "member");
  await page.goto(`/invitations/${canceled}`);
  await expect(page.getByRole("heading", { name: `You are already in ${teamName}` })).toBeVisible();
  // A Button rendered as a Link keeps the button role.
  await page.getByRole("button", { name: `Open ${teamName}` }).or(page.getByRole("link", { name: `Open ${teamName}` })).click();
  await page.waitForURL(new RegExp(`/app\\?team=${team.slug}$`));
  await leaveTestTeam(team.id, devId);
});
