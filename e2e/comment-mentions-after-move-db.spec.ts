import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { closeInboxDb, giveHandle } from "./support/inbox-db";
import { addTestMember, cleanUp, createTestArtifact, createTestTeam, createTestUser, deleteTestTeams, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, sharingOf } from "./support/local-db";

/**
 * Who "@" offers in a comment after the artifact's sharing changed in the
 * same tab, against a real database. A private artifact's comments reach
 * only its author, so the list starts empty; once the author moves the
 * artifact to a team, the comment box lists the teammates without a reload.
 * Needs dev sign-in and a local throwaway database (support/local-db.ts);
 * skipped otherwise. The same reload runs in CI on a fixture
 * (artifact-page-share.spec.ts).
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const people: string[] = [];
const teams: string[] = [];

test.afterAll(async () => {
  await closeInboxDb();
  await cleanUp(created, []);
  await deleteTestTeams(teams);
  await cleanUp([], people);
});

const suggestions = (page: Page) => page.getByRole("listbox", { name: "Mention suggestions" });

/** Signs in as the dev user and seeds a team with one teammate who has a handle, and a private Markdown artifact. */
async function seed(page: Page, title: string) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const me = await readyDevUser();
  const teammate = await createTestUser();
  people.push(teammate);
  const handle = `mate-${teammate.slice(0, 8)}`;
  await giveHandle(teammate, handle);
  const team = await createTestTeam(me);
  teams.push(team.id);
  await addTestMember(team.id, teammate, "member");
  const publicId = await createTestArtifact({ userId: me, title, content: "Launch plan.", visibility: "private", theme: null });
  created.push(publicId);
  return { publicId, handle, team };
}

/** Moves the artifact to the team in the open Share dialog, and waits for the toast that says so. */
async function moveToTeam(page: Page, title: string, teamId: string) {
  const dialog = page.getByRole("dialog", { name: `Share “${title}”` });
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Team/ }).click();
  await dialog.getByRole("combobox", { name: "Move to" }).click();
  await page.getByRole("option", { name: new RegExp(`^Theme team ${teamId.slice(0, 4)}`) }).click();
  await dialog.getByRole("button", { name: /^Move to Theme team/ }).click();
  await expect(page.getByText(`Moved “${title}” to Theme team`, { exact: false })).toBeVisible();
}

/** Types at the end of a comment box once the rich box has taken over, so "@" opens its list. */
async function typeInBox(page: Page, box: ReturnType<Page["getByRole"]>, text: string) {
  await box.click();
  await expect(box).toHaveAttribute("contenteditable", "true");
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("should list teammates under @ on the artifact page after the artifact moved to their team, without a reload", async ({ page }, testInfo) => {
  const title = `Mention after move ${testInfo.project.name}`;
  const { publicId, handle, team } = await seed(page, title);

  await page.goto(`/artifact/${publicId}`);
  const thread = page.getByRole("region", { name: "Comments" });
  const box = thread.getByRole("textbox", { name: "Write a comment" });
  // While it is private nobody else can read it, so nobody can be mentioned.
  await typeInBox(page, box, "Ask @");
  await expect(page.getByText("No one to mention here yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("banner").getByRole("button", { name: "Private. Share settings" }).click();
  await moveToTeam(page, title, team.id);
  await expect(page.getByRole("banner").getByRole("button", { name: "Team. Share settings" })).toBeVisible();
  expect(await sharingOf(publicId)).toEqual({ visibility: "team", teamId: team.id });

  // A new "@": Escape keeps the one it closed shut.
  await typeInBox(page, box, " or @mate");
  await expect(suggestions(page).getByRole("option", { name: new RegExp(`@${handle}`) }), "the teammate is offered without a reload").toBeVisible();
});

test("should list teammates under @ in the workspace's Comments dialog after the artifact moved to their team", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "The workspace's toolbar is covered on desktop; the comment list is the same component.");
  const title = `Mention after move app ${testInfo.project.name}`;
  const { publicId, handle, team } = await seed(page, title);

  await page.goto(`/app?artifact=${publicId}`);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Comments on ${title}` });
  await typeInBox(page, dialog.getByRole("textbox", { name: "Write a comment" }), "Ask @");
  await expect(page.getByText("No one to mention here yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Share settings", exact: true }).click();
  await moveToTeam(page, title, team.id);
  // The artifact left the Personal workspace; the toast is the way to it in the team's.
  await page.getByRole("button", { name: /^Open in Theme team/ }).click();
  await expect(page).toHaveURL(/artifact=/);

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await typeInBox(page, dialog.getByRole("textbox", { name: "Write a comment" }), "Ask @mate");
  await expect(suggestions(page).getByRole("option", { name: new RegExp(`@${handle}`) }), "the teammate is offered without a reload").toBeVisible();
});
