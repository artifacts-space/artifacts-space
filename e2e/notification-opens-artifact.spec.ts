import { expect, test, type Page } from "@playwright/test";

/**
 * Choosing a notification while the workspace is already open: the bell's
 * row opens its artifact in the main panel, every time, without reloading
 * the workspace. Checked on /dev/workspace, the real workspace and bell
 * without a database, on a phone and a desktop.
 */

const editor = (page: Page, title: string) => page.getByRole("region", { name: `Edit ${title}` });
const selectedCard = (page: Page) => page.locator('[data-slot="artifact-list"] [aria-current="true"]');
const commentsHeading = (page: Page, title: string) => page.getByRole("heading", { name: `Comments on ${title}` });

/** Opens the bell and chooses the row that says `text`. */
async function chooseNotification(page: Page, text: string) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog").getByRole("link").filter({ hasText: text }).click();
}

/** On a phone the list sits above the artifact, so the artifact must start near the top of the screen. */
async function expectBroughtIntoView(page: Page, title: string) {
  const region = editor(page, title);
  await expect(region).toBeInViewport();
  const viewport = page.viewportSize();
  const box = await region.boundingBox();
  if (!viewport || !box) throw new Error("The artifact has no size");
  expect(box.y).toBeLessThan(viewport.height / 3);
}

test("should open the artifact and then its comments when a comment notification is chosen from the workspace", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();

  await chooseNotification(page, "mentioned you on Long markdown fixture");
  await expect(commentsHeading(page, "Long markdown fixture")).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await page.keyboard.press("Escape");
  await expect(commentsHeading(page, "Long markdown fixture")).toHaveCount(0);

  await expect(selectedCard(page)).toContainText("Long markdown fixture");
  await expectBroughtIntoView(page, "Long markdown fixture");
});

test("should open the same artifact again when the same notification is chosen twice", async ({ page }) => {
  await page.goto("/dev/workspace");
  await chooseNotification(page, "mentioned you on Long markdown fixture");
  await expect(commentsHeading(page, "Long markdown fixture")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator('[data-slot="artifact-list"]').getByRole("button", { name: /Long ui fixture/ }).click();
  await expect(editor(page, "Long ui fixture")).toBeVisible();

  await chooseNotification(page, "mentioned you on Long markdown fixture");
  await expect(commentsHeading(page, "Long markdown fixture")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selectedCard(page)).toContainText("Long markdown fixture");
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
});

test("should pin an artifact outside the list to the top and open it when its notification is chosen", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();

  await chooseNotification(page, "approved sharing Shared by link fixture");
  await expect(editor(page, "Shared by link fixture")).toBeVisible();
  await expect(page.locator('[data-slot="artifact-list"] li').first()).toContainText("Shared by link fixture");
  await expect(selectedCard(page)).toContainText("Shared by link fixture");
  await expect(commentsHeading(page, "Shared by link fixture")).toHaveCount(0);
  await expectBroughtIntoView(page, "Shared by link fixture");
});

test("should keep the list's filters when a notification opens an artifact", async ({ page }) => {
  // The format filter, not search: search asks the server, which the fixture has none of.
  await page.goto("/dev/workspace");
  const format = page.getByRole("combobox", { name: "Filter by format" });
  await format.click();
  await page.getByRole("option", { name: "text", exact: true }).click();
  await expect(format).toContainText("text");

  await chooseNotification(page, "approved your changes to Long markdown fixture");
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
  await expect(format).toContainText("text");
});

test("should say the artifact is no longer available and keep the workspace when the linked one is gone", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();

  await chooseNotification(page, "declined sharing Removed fixture");
  await expect(page.getByText("This artifact is no longer available.")).toBeVisible();
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
});

test("should say the artifact is no longer available when a link to a missing artifact opens the workspace", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacegone&comments=1");
  await expect(page.getByText("This artifact is no longer available.")).toBeVisible();
  await expect(editor(page, "Long ui fixture")).toBeVisible();
});

test("should say the artifact could not be opened, not that it is gone, when the server could not check the link", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacelinked&linkcheck=failed");
  await expect(page.getByText("This artifact could not be opened just now. Try the link again in a moment.")).toBeVisible();
  await expect(page.getByText("This artifact is no longer available.")).toHaveCount(0);
  await expect(editor(page, "Long ui fixture")).toBeVisible();
});

test("should not jump back to the linked artifact when the page refreshes after a save", async ({ page }) => {
  await page.goto("/dev/workspace");
  await chooseNotification(page, "mentioned you on Long markdown fixture");
  await expect(commentsHeading(page, "Long markdown fixture")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-slot="artifact-list"]').getByRole("button", { name: /Long ui fixture/ }).click();
  await expect(editor(page, "Long ui fixture")).toBeVisible();

  // A save on /app revalidates the page, and the router refreshes its own URL: that URL must have lost the link too.
  const refreshed = page.waitForResponse((response) => response.request().headers().rsc === "1");
  await page.evaluate(() => { window.fixtureRefresh?.(); });
  expect((await refreshed).url()).not.toContain("artifact=");
  await expect(selectedCard(page)).toContainText("Long ui fixture");
  await expect(commentsHeading(page, "Long markdown fixture")).toHaveCount(0);
  await expect(page).toHaveURL(/\/dev\/workspace$/);
});

test("should not reopen an earlier link when the person goes back or reloads", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacenote01&comments=1");
  await expect(commentsHeading(page, "Note 2")).toBeVisible();
  await page.keyboard.press("Escape");

  await chooseNotification(page, "approved your changes to Long markdown fixture");
  await expect(selectedCard(page)).toContainText("Long markdown fixture");

  await page.goBack();
  // Back changes nothing on screen, so there is no event to wait for: give a wrongly reopened dialog a moment to show.
  await page.waitForTimeout(1000);
  await expect(commentsHeading(page, "Note 2")).toHaveCount(0);
  await expect(selectedCard(page)).toContainText("Long markdown fixture");

  await page.reload();
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await expect(commentsHeading(page, "Note 2")).toHaveCount(0);
});
