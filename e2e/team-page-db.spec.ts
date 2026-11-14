import { expect, test } from "./support/test";

import {
  cleanUp,
  createTestArtifact,
  createTestTeam,
  deleteTestTeams,
  inviteTestPerson,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  readyDevUser,
  requestTestSharing,
  shareTestArtifact,
} from "./support/local-db";

/**
 * The real team page against a local throwaway database: a notification's
 * deep link opens the approval queue, the tabs keep their URL, and an open
 * invitation sits in the Members table. Skipped without a local database.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const seeded = { publicIds: [] as string[], teamIds: [] as string[], slug: "" };

test.afterAll(async () => {
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, []);
});

test("should open the approval queue from a deep link and keep each tab in the URL", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The seeded flow runs once, on the desktop viewport.");
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  const team = await createTestTeam(userId, "owner");
  seeded.teamIds.push(team.id);
  seeded.slug = team.slug;
  const shared = await createTestArtifact({ userId, title: "Shared plan", content: "# Plan", visibility: "private", theme: null });
  const waiting = await createTestArtifact({ userId, title: "Waiting roadmap", content: "# Roadmap", visibility: "private", theme: null });
  seeded.publicIds.push(shared, waiting);
  await shareTestArtifact(shared, team.id, "team");
  await requestTestSharing(waiting, team.id, userId, "link");
  await inviteTestPerson(team.id, userId, `invitee-${team.id.slice(0, 8)}@example.com`);

  await page.goto(`/teams/${team.slug}?tab=artifacts&view=approval`);
  await expect(page.getByRole("tab", { name: "Shared artifacts 1" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Needs approval 1" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Waiting roadmap")).toBeVisible();

  await page.getByRole("tab", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.slug}\\?tab=artifacts$`));
  await expect(page.getByRole("table", { name: "Shared artifacts" })).toContainText("Shared plan");

  await page.getByRole("tab", { name: "Members" }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.slug}\\?tab=members$`));
  await expect(page.getByRole("table", { name: "Members" }).locator("[data-member-row=invitation]")).toContainText("Invited · expires");

  await page.reload();
  await expect(page.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
});
