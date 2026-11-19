import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { readColors } from "./support/colors";

/*
 * Share on the artifact's own page, on /dev/artifact-share (the page's
 * header with fixture data and no database). The owner's visibility status
 * opens the workspace's Share dialog, and a save moves a personal artifact
 * into a team; sharing is kept in memory and decided by the real sharing
 * rule. A reader keeps the read-only status. artifact-page-share-db.spec.ts
 * runs the same flow against the real page and server actions.
 */

const header = (page: Page) => page.getByRole("banner");

async function openAsOwner(page: Page) {
  await page.goto("/dev/artifact-share");
  const share = header(page).getByRole("button", { name: "Private. Share settings" });
  await expect(share).toBeVisible();
  return share;
}

/** Sideways overflow of the page and the header row, and whether the header's controls share one line. */
function headerFit(page: Page) {
  return header(page).evaluate((element) => {
    const row = element.getBoundingClientRect();
    const children = [...element.querySelectorAll("a, button")].map((child) => child.getBoundingClientRect());
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      row: element.scrollWidth - element.clientWidth,
      oneLine: children.every((box) => Math.abs(box.top + box.height / 2 - (row.top + row.height / 2)) < 2),
    };
  });
}

test("should move a personal artifact into a team from the page's Share when the owner saves", async ({ page }) => {
  const share = await openAsOwner(page);
  await share.click();
  const dialog = page.getByRole("dialog", { name: "Share “Launch checklist”" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Team/ }).click();
  // The team becomes the artifact's home, so the control and the button say "Move", and the dialog says what it leaves.
  await expect(dialog.getByRole("combobox", { name: "Move to" }), "the first shared team is picked").toContainText("Platform");
  await expect(dialog.locator("[data-slot=share-outcome]")).toContainText("It applies as soon as you save. It moves to Platform and leaves your personal artifacts.");
  await dialog.getByRole("button", { name: "Move to Platform" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Moved “Launch checklist” to Platform.")).toBeVisible();
  const moved = header(page).getByRole("button", { name: "Team. Share settings" });
  await expect(moved).toBeVisible();
  await expect(moved).toHaveAttribute("data-visibility", "team");
  await expect(page.locator("[data-fixture-sharing]")).toHaveText("team:fixture-platform");
  await expect(moved, "focus comes back to the button").toBeFocused();

  // Reopened, the dialog starts from what was saved.
  await moved.click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.getByRole("radio", { name: /^Team/ })).toHaveAttribute("aria-checked", "true");
  // It is there now: nothing moves, so the picker names the team and the button saves.
  await expect(reopened.getByRole("combobox", { name: "Team" })).toContainText("Platform");
  await expect(reopened.getByRole("button", { name: "Save" })).toBeVisible();

  // Private again reads as the move back.
  await reopened.getByRole("radio", { name: /^Private/ }).click();
  await expect(reopened.locator("[data-slot=share-outcome]")).toHaveText("Only you can read it. Any open request is canceled. It moves back to your personal artifacts and leaves Platform.");
  await reopened.getByRole("button", { name: "Move to Personal" }).click();
  await expect(page.getByText("Moved “Launch checklist” back to Personal.")).toBeVisible();
  await expect(page.locator("[data-fixture-sharing]")).toHaveText("private:none");
});

test("should say Pending in the header when the team's sharing waits for approval", async ({ page }) => {
  const share = await openAsOwner(page);
  await share.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^Team/ }).click();
  await dialog.getByRole("combobox", { name: "Move to" }).click();
  await page.getByRole("option", { name: "Design" }).click();
  // Design's rule needs an approval: nothing moves yet, and the button only asks.
  await expect(dialog.locator("[data-slot=share-outcome]")).toContainText("Someone in Design who approves sharing approves it first. Until then, it stays as it is. Once approved, it moves to Design and leaves your personal artifacts.");
  await dialog.getByRole("button", { name: "Ask to move to Design" }).click();

  await expect(page.getByText("Request sent. An owner or admin will review it.")).toBeVisible();
  const pending = header(page).getByRole("button", { name: "Pending. Share settings" });
  await expect(pending).toBeVisible();
  await expect(pending).toHaveAttribute("data-pending", "true");
  await expect(page.locator("[data-fixture-sharing]"), "it stays private until approved").toHaveText("private:none");

  await pending.click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.getByText(/Waiting for approval: team in Design/)).toBeVisible();
  // The picks start from the level that still applies, not the one waiting, so Save never re-sends the request.
  await expect(reopened.getByRole("radio", { name: /^Private/ })).toHaveAttribute("aria-checked", "true");
  await expect(reopened.getByRole("combobox", { name: /^(Move to|Team)$/ })).toHaveCount(0);
  await expect(reopened.locator("[data-slot=share-outcome]")).toHaveText("Only you can read it. Any open request is canceled.");
});

test("should show a reader only the read-only status when they may not share", async ({ page }) => {
  await page.goto("/dev/artifact-share?as=reader");
  const status = header(page).getByRole("button", { name: "Team. Shared by Dev in Platform. Only team members can see this." });
  await expect(status).toBeVisible();
  await expect(header(page).getByRole("button", { name: /Share settings/ })).toHaveCount(0);
  await status.click();
  await expect(page.getByRole("dialog"), "the status opens nothing").toHaveCount(0);
});

test("should keep the owner's header on one line at 375px with a 44px Share on touch screens", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const share = await openAsOwner(page);
  const fit = await headerFit(page);
  expect(fit.page, "no sideways page scroll").toBeLessThanOrEqual(0);
  expect(fit.row, "the header row does not scroll sideways").toBeLessThanOrEqual(0);
  expect(fit.oneLine, "the header stays on one line").toBe(true);

  // Touch screens (the phone project) get a 44px target; a mouse keeps the header's 32px controls.
  const minimum = testInfo.project.name === "phone" ? 44 : 32;
  const box = await share.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(minimum);
  expect(box?.height).toBeGreaterThanOrEqual(minimum);
});

/** The theme tokens an element draws its surface, text, and border with, as the browser resolved them. */
function surfaceTokens(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return ["--popover", "--popover-foreground", "--border", "--background", "--foreground"].map((name) => style.getPropertyValue(name).trim());
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`should give the page's dialog and toast the artifact theme's colors, readable, when the site is ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    // What the site's own palette gives a dialog, to tell the theme's from it.
    await (await openAsOwner(page)).click();
    const dialog = page.getByRole("dialog", { name: "Share “Launch checklist”" });
    await expect(dialog).toBeVisible();
    const siteTokens = await surfaceTokens(dialog);

    await page.goto("/dev/artifact-share?theme=ink");
    const themed = page.locator("[data-page-theme=set]");
    await header(page).getByRole("button", { name: "Private. Share settings" }).click();
    await expect(dialog).toBeVisible();
    // The dialog is in a portal outside the themed page, and still draws with the page's tokens.
    const pageTokens = await surfaceTokens(themed);
    expect(await surfaceTokens(dialog)).toEqual(pageTokens);
    expect(pageTokens).not.toEqual(siteTokens);
    expect((await readColors(dialog.getByRole("heading", { name: "Share “Launch checklist”" }))).contrast).toBeGreaterThanOrEqual(4.5);

    await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Team/ }).click();
    await dialog.getByRole("button", { name: "Move to Platform" }).click();
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Moved “Launch checklist” to Platform." });
    await expect(toast).toBeVisible();
    expect(await surfaceTokens(toast)).toEqual(pageTokens);
    expect((await readColors(toast.locator("[data-title]"))).contrast).toBeGreaterThanOrEqual(4.5);
  });
}
