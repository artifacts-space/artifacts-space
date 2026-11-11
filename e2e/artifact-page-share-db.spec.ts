import { expect, test, type Browser, type Page } from "@playwright/test";

import { addTestMember, cleanUp, createTestArtifact, createTestTeam, createTestUser, deleteTestTeams, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, shareTestArtifact, sharingOf } from "./support/local-db";

/**
 * Share on the artifact's own page against a real database: the owner moves
 * a private artifact into a team through the workspace's server actions and
 * the page catches up; a teammate who may edit someone else's artifact, and
 * a signed-out reader, keep the read-only status. Needs dev sign-in and a
 * local throwaway database (support/local-db.ts); skipped otherwise.
 * artifact-page-share.spec.ts covers the same header on a fixture in CI.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const users: string[] = [];
const teams: string[] = [];

test.afterAll(async () => {
  await deleteTestTeams(teams);
  await cleanUp(created, users);
});

const header = (page: Page) => page.getByRole("banner");

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
}

/** A shared team with the dev user at `role`, removed afterwards. */
async function seedTeam(userId: string, role: "owner" | "member" = "owner") {
  const team = await createTestTeam(userId, role);
  teams.push(team.id);
  return team;
}

/** A Markdown artifact by `userId`, removed afterwards. */
async function seedArtifact(userId: string, title: string, visibility: "private" | "public" = "private") {
  const publicId = await createTestArtifact({ userId, title, content: "# Notes\n\nA short note.", visibility, theme: null });
  created.push(publicId);
  return publicId;
}

/** Opens the page as someone signed out, in a fresh browser context. */
async function asSignedOut(browser: Browser, publicId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/artifact/${publicId}`);
  return { page, close: () => context.close() };
}

test("should let the owner move a private artifact into a team from the page and show it after the save", async ({ page }, testInfo) => {
  await signIn(page);
  const userId = await readyDevUser();
  const team = await seedTeam(userId);
  const title = `Page share ${testInfo.project.name}`;
  const publicId = await seedArtifact(userId, title);

  await page.goto(`/artifact/${publicId}`);
  await header(page).getByRole("button", { name: "Private. Share settings" }).click();
  const dialog = page.getByRole("dialog", { name: `Share “${title}”` });
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Team/ }).click();
  await dialog.getByRole("combobox", { name: "Share with" }).click();
  await page.getByRole("option", { name: new RegExp(`^Theme team ${team.id.slice(0, 4)}`) }).click();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Sharing saved.")).toBeVisible();
  await expect(header(page).getByRole("button", { name: "Team. Share settings" }), "the page refreshes from the server").toBeVisible();
  expect(await sharingOf(publicId)).toEqual({ visibility: "team", teamId: team.id });

  await page.reload();
  await expect(header(page).getByRole("button", { name: "Team. Share settings" })).toBeVisible();
});

test("should keep the read-only status for a teammate who may edit someone else's artifact", async ({ page }, testInfo) => {
  await signIn(page);
  const userId = await readyDevUser();
  const team = await seedTeam(userId, "owner");
  const author = await createTestUser();
  users.push(author);
  await addTestMember(team.id, author, "member");
  const publicId = await seedArtifact(author, `Teammate share ${testInfo.project.name}`);
  await shareTestArtifact(publicId, team.id, "team");

  await page.goto(`/artifact/${publicId}`);
  await expect(page.getByRole("textbox", { name: "Title" }), "a team owner may edit it").toBeVisible();
  await expect(header(page).locator("[data-visibility=team]")).toBeVisible();
  await expect(header(page).getByRole("button", { name: /Share settings/ }), "only the author shares it").toHaveCount(0);
});

test("should keep the read-only status for a signed-out reader of a public artifact", async ({ page, browser }, testInfo) => {
  await signIn(page);
  const userId = await readyDevUser();
  const publicId = await seedArtifact(userId, `Reader share ${testInfo.project.name}`, "public");

  const reader = await asSignedOut(browser, publicId);
  await expect(header(reader.page).locator("[data-visibility=public]")).toBeVisible();
  await expect(header(reader.page).getByRole("button", { name: /Share settings/ })).toHaveCount(0);
  await reader.close();
});
