import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * What a person sees before they leave a team, and what an owner sees before
 * removing someone (#219), on /dev/team: the real team page with fixture
 * data and an in-memory stand-in for the leave actions (fixture-leave.tsx),
 * which names the new owner by the real rule. `?leaving=<n>` is how many of
 * the viewer's artifacts live in the team, and `?move=wait|refuse` what
 * moving the first one to Personal does. The server side (only one's own
 * artifacts move, into Personal and out of the team, and the hand-over goes
 * to the person named) is checked in src/lib/teams/departure.db.test.ts.
 */

const leaveDialog = (page: Page) => page.getByRole("dialog", { name: "Leave Fixture team?" });
const artifactList = (page: Page) => leaveDialog(page).getByRole("list", { name: "Your artifacts in this team" });

async function openLeave(page: Page, query: string) {
  await page.goto(`/dev/team?as=member${query}`);
  await page.getByRole("button", { name: "Leave team" }).click();
  await expect(leaveDialog(page)).toBeVisible();
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("should list what stays with the team and name its new owner before the person leaves", async ({ page }) => {
  await openLeave(page, "");
  const dialog = leaveDialog(page);
  await expect(dialog.getByText("7 of your artifacts live in this team. They stay with the team when you leave, and Ada Lovelace (@ada), its longest-standing owner, becomes their owner.")).toBeVisible();
  await expect(artifactList(page).getByRole("checkbox")).toHaveCount(5);
  await expect(dialog.getByText("and 2 more")).toBeVisible();
  // A choice to make: never a "Don't ask again" that could skip it.
  await expect(dialog.getByRole("checkbox", { name: "Don't ask again" })).toHaveCount(0);
  await expectNoAxeViolations(dialog);

  await dialog.getByRole("button", { name: "Show all 7" }).click();
  await expect(artifactList(page).getByRole("checkbox")).toHaveCount(7);
  await expect(dialog.getByText("and 2 more")).toHaveCount(0);
  await expectNoAxeViolations(dialog);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("should move a chosen artifact to Personal first, and leave it off the list", async ({ page }) => {
  await openLeave(page, "");
  const dialog = leaveDialog(page);
  await expect(dialog.getByRole("button", { name: "Move selected to Personal" })).toBeDisabled();
  await artifactList(page).getByRole("checkbox", { name: "Q3 roadmap" }).click();
  await dialog.getByRole("button", { name: "Move selected to Personal" }).click();

  await expect(page.getByText("Moved “Q3 roadmap” to Personal.")).toBeVisible();
  await expect(artifactList(page).getByText("Q3 roadmap")).toHaveCount(0);
  await expect(dialog.getByText(/^6 of your artifacts live in this team\./)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Move selected to Personal" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Move all to Personal" }).click();
  await expect(page.getByText("Moved 6 artifacts to Personal.")).toBeVisible();
  await expect(dialog.getByText("None of your artifacts live in this team now, so nothing of yours stays behind.")).toBeVisible();
  await expect(artifactList(page)).toHaveCount(0);
  await expectNoAxeViolations(dialog);
});

test("should say plainly when a move waits for approval, and not count it as moved", async ({ page }) => {
  await openLeave(page, "&leaving=2&move=wait");
  const dialog = leaveDialog(page);
  await dialog.getByRole("button", { name: "Move all to Personal" }).click();
  await expect(dialog.getByText("“Launch plan” waits for an owner's or admin's approval, so it is still in this team. If you leave now, it goes to the new owner.")).toBeVisible();
  await expect(artifactList(page).getByText("Launch plan")).toBeVisible();
  await expect(dialog.getByText(/^One of your artifacts lives in this team\./)).toBeVisible();
  await expectNoAxeViolations(dialog);
});

test("should name a refused move with its reason", async ({ page }) => {
  await openLeave(page, "&leaving=1&move=refuse");
  const dialog = leaveDialog(page);
  await artifactList(page).getByRole("checkbox", { name: "Launch plan" }).click();
  await dialog.getByRole("button", { name: "Move selected to Personal" }).click();
  await expect(dialog.getByText(/^“Launch plan” did not move: Artifact not found\./)).toBeVisible();
  await expect(artifactList(page).getByText("Launch plan")).toBeVisible();
});

test("should keep the plain confirm when none of the person's artifacts live in the team", async ({ page }) => {
  await openLeave(page, "&leaving=0");
  const dialog = leaveDialog(page);
  await expect(dialog.getByText(/^None of your artifacts live in this team, so nothing of yours stays behind\./)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Don't ask again" })).toBeVisible();
  await expect(artifactList(page)).toHaveCount(0);
  await expectNoAxeViolations(dialog);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("should tell the remover that a member's artifacts stay and who takes them", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Actions for Grace Hopper" }).click();
  await page.getByRole("menuitem", { name: "Remove from team" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Grace Hopper?" });
  // The viewer is the fixture's longest-standing owner, so Grace's two artifacts would go to them.
  await expect(dialog.getByText("They lose access to this team at once. 2 of their artifacts live in this team. They stay with the team, and Dev User (@dev), its longest-standing owner, becomes their owner.", { exact: false })).toBeVisible();
  await expectNoAxeViolations(dialog);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Actions for Lin Designer" }).click();
  await page.getByRole("menuitem", { name: "Remove from team" }).click();
  await expect(page.getByRole("dialog", { name: "Remove Lin Designer?" }).getByText(/None of their artifacts live in this team\./)).toBeVisible();
});
