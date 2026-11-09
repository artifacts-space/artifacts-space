import { expect, test } from "@playwright/test";

import {
  addTestMember,
  cleanUp,
  createTestArtifact,
  createTestTeam,
  createTestUser,
  customRoleOf,
  deleteTestTeams,
  demoteDirectly,
  demoteEveryoneDirectly,
  demoteOwnersAtOnce,
  giveTestCustomRole,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  permissionAuditActions,
  readyDevUser,
  requestTestSharing,
  roleCapabilities,
  seededRoles,
  setTeamRole,
} from "./support/local-db";

/**
 * Roles and permissions against a local throwaway database: an owner makes
 * a custom role, edits it, gives it to someone, and sees each change in the
 * log; a custom role's capabilities decide what its holder sees. Skipped
 * without a local database.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const seeded = { publicIds: [] as string[], teamIds: [] as string[], userIds: [] as string[] };

test.afterAll(async () => {
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, seeded.userIds);
});

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The seeded flows run once, on the desktop viewport.");
});

test("should let an owner create, edit, and give a custom role, and log each change", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const ownerId = await readyDevUser();
  const team = await createTestTeam(ownerId, "owner");
  seeded.teamIds.push(team.id);
  const teammate = await createTestUser();
  seeded.userIds.push(teammate);
  await addTestMember(team.id, teammate, "member");

  await page.goto(`/teams/${team.slug}?tab=permissions`);
  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog", { name: "New role" });
  await dialog.getByLabel("Name", { exact: true }).fill("Reviewer");
  await dialog.getByText("Approve sharing", { exact: true }).click();
  await dialog.getByRole("button", { name: "Create role" }).click();
  await expect(dialog).toHaveCount(0);

  const matrix = page.getByRole("table", { name: "Permissions by role" });
  await expect(matrix.getByRole("checkbox", { name: "Approve sharing for Reviewer" })).toBeChecked();
  await matrix.getByRole("checkbox", { name: "Approve edits for Reviewer" }).click();
  await expect(page.getByText("Permissions saved.")).toBeVisible();
  await expect(matrix.getByRole("checkbox", { name: "Approve edits for Reviewer" })).toBeChecked();

  await page.getByRole("tab", { name: "Members" }).click();
  await page.getByRole("combobox", { name: "Role for Theme e2e" }).click();
  await page.getByRole("option", { name: "Reviewer" }).click();
  await expect(page.getByRole("combobox", { name: "Role for Theme e2e" })).toHaveText(/Reviewer/);
  await expect.poll(() => customRoleOf(team.id, teammate)).toBe("reviewer");

  await page.getByRole("tab", { name: "Permissions" }).click();
  await expect(page.getByText(/created the Reviewer role: Approve sharing\./)).toBeVisible();
  await expect(page.getByText(/changed Reviewer: added Approve edits\./)).toBeVisible();
  await expect(page.getByText(/changed Theme e2e's role from Member to Reviewer\./)).toBeVisible();

  // The seeded team has no stored Member role yet: the first change stores it, the second removes one capability.
  const memberLink = matrix.getByRole("checkbox", { name: "Share by link for Member" });
  await memberLink.click();
  await expect(memberLink).toBeChecked();
  await expect(matrix.getByRole("checkbox", { name: "See views for Member" })).toBeChecked();
  // The first edit stored the role with all of its defaults plus the new cell, never the one cell alone.
  await expect.poll(() => roleCapabilities(team.id, "member")).toEqual(["analytics.view", "share.link"]);
  await memberLink.click();
  await expect(memberLink).not.toBeChecked();
  await expect(matrix.getByRole("checkbox", { name: "See views for Member" })).toBeChecked();

  await matrix.getByRole("button", { name: "Delete the Reviewer role" }).click();
  await page.getByRole("dialog", { name: "Delete the Reviewer role?" }).getByRole("button", { name: "Delete role" }).click();
  await expect(matrix.getByRole("columnheader", { name: /Reviewer/ })).toHaveCount(0);
  await expect.poll(() => customRoleOf(team.id, teammate)).toBeNull();
  await expect(page.getByText(/deleted the Reviewer role\./)).toBeVisible();
  // The person who had it is logged too, in the same statement as the deletion.
  await expect(page.getByText(/changed Theme e2e's role from Reviewer to Member\./)).toBeVisible();
  await expect.poll(async () => (await permissionAuditActions(team.id)).sort()).toEqual(["member_role_changed", "member_role_changed", "role_created", "role_deleted", "role_updated", "role_updated", "role_updated"]);

  // A narrowed built-in role stays narrow: taking See views away and then adding Share by link never brings the defaults back.
  const memberViews = matrix.getByRole("checkbox", { name: "See views for Member" });
  await memberViews.click();
  await expect(memberViews).not.toBeChecked();
  await memberLink.click();
  await expect(memberLink).toBeChecked();
  await expect(memberViews).not.toBeChecked();
  await expect.poll(() => roleCapabilities(team.id, "member")).toEqual(["share.link"]);

  // Removal goes through the same capability lock on the Better Auth call itself.
  await page.getByRole("tab", { name: "Members" }).click();
  await page.getByRole("button", { name: "Actions for Theme e2e" }).click();
  await page.getByRole("menuitem", { name: "Remove from team" }).click();
  await page.getByRole("dialog", { name: "Remove Theme e2e?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("table", { name: "Members" }).getByText("Theme e2e")).toHaveCount(0);

  // Invitations pass the invite hook's role ceiling, which asks the same rule as the action.
  const invitee = `invitee-${team.id.slice(0, 8)}@example.com`;
  await page.getByRole("button", { name: "Invite people" }).click();
  const invite = page.getByRole("dialog", { name: "Invite people" });
  await invite.getByLabel("Email").fill(invitee);
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("table", { name: "Members" }).locator("[data-member-row=invitation]")).toContainText(invitee);
});

test("should show the approval queue only to a custom role that may approve", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const viewerId = await readyDevUser();
  const owner = await createTestUser();
  seeded.userIds.push(owner);
  const team = await createTestTeam(owner, "owner");
  seeded.teamIds.push(team.id);
  await addTestMember(team.id, viewerId, "member");
  const waiting = await createTestArtifact({ userId: owner, title: "Waiting brief", content: "# Brief", visibility: "private", theme: null });
  seeded.publicIds.push(waiting);
  await requestTestSharing(waiting, team.id, owner, "link");

  await page.goto(`/teams/${team.slug}?tab=artifacts&view=approval`);
  await expect(page.getByRole("tablist", { name: "Shared artifacts views" })).toHaveCount(0);
  await expect(page.getByText("Waiting brief")).toHaveCount(0);

  await giveTestCustomRole(team.id, viewerId, "Approver", ["approve.sharing"]);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Needs approval 1" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Waiting brief")).toBeVisible();
  await expect(page.getByText(/You are approver/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite people" })).toHaveCount(0);
});

test("should keep one owner when two owners demote each other at the same moment", async () => {
  const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
  seeded.userIds.push(first, second);
  const team = await createTestTeam(first, "owner");
  seeded.teamIds.push(team.id);
  await addTestMember(team.id, second, "owner");

  const outcome = await demoteOwnersAtOnce(team.id, first, second);
  expect(outcome).toEqual({ first: true, second: false });
});

test("should refuse demoting a team's only owner in the database itself, and allow it once another owner stays", async () => {
  const owner = await createTestUser();
  seeded.userIds.push(owner);
  const team = await createTestTeam(owner, "owner");
  seeded.teamIds.push(team.id);
  await expect(demoteDirectly(team.id, owner)).rejects.toThrow("A team always keeps at least one owner.");
  await setTeamRole(team.id, owner, "member");
});

test("should refuse demoting every owner in one statement", async () => {
  const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
  seeded.userIds.push(first, second);
  const team = await createTestTeam(first, "owner");
  seeded.teamIds.push(team.id);
  await addTestMember(team.id, second, "owner");
  await expect(demoteEveryoneDirectly(team.id)).rejects.toThrow("A team always keeps at least one owner.");
});

test("should give a new team its built-in roles with today's rules", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  await readyDevUser();
  const slug = `theme-e2e-new-${String(Date.now()).slice(-8)}`;
  await page.goto("/teams/new");
  await page.getByLabel("Name", { exact: true }).fill("Seeded roles");
  await page.getByLabel("Team URL").fill(slug);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect.poll(async () => (await seededRoles(slug).catch(() => null))?.roles ?? null).toEqual({ owner: 14, admin: 13, member: 1, agent: 1 });
  seeded.teamIds.push((await seededRoles(slug)).teamId);
});
