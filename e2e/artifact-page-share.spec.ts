import { expect, test, type Page } from "@playwright/test";

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
  await expect(dialog.getByRole("combobox", { name: "Share with" }), "the first shared team is picked").toContainText("Platform");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Sharing saved.")).toBeVisible();
  const moved = header(page).getByRole("button", { name: "Team. Share settings" });
  await expect(moved).toBeVisible();
  await expect(moved).toHaveAttribute("data-visibility", "team");
  await expect(page.locator("[data-fixture-sharing]")).toHaveText("team:fixture-platform");
  await expect(moved, "focus comes back to the button").toBeFocused();
});

test("should say Pending in the header when the team's sharing waits for approval", async ({ page }) => {
  const share = await openAsOwner(page);
  await share.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^Team/ }).click();
  await dialog.getByRole("combobox", { name: "Share with" }).click();
  await page.getByRole("option", { name: "Design" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Request sent. An owner or admin will review it.")).toBeVisible();
  const pending = header(page).getByRole("button", { name: "Pending. Share settings" });
  await expect(pending).toBeVisible();
  await expect(pending).toHaveAttribute("data-pending", "true");
  await expect(page.locator("[data-fixture-sharing]"), "it stays private until approved").toHaveText("private:none");

  await pending.click();
  await expect(page.getByRole("dialog").getByText(/Waiting for approval: team in Design/)).toBeVisible();
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
