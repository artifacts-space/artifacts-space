import { expect, test, type Page } from "@playwright/test";

/**
 * "Something's not working", on /dev/workspace (the real workspace without a
 * database). The fixture's stand-in replaces the server action, so nothing
 * reaches Slack; `?feedback=fail|unavailable|limit` picks its answer, and it
 * records what the dialog sent on `document.body.dataset.fixtureFeedback`.
 */

async function openFeedback(page: Page, query = "") {
  await page.goto(`/dev/workspace${query}`);
  const menu = page.getByRole("button", { name: "Account menu" });
  await expect(menu).toBeVisible();
  await menu.click();
  await page.getByRole("menuitem", { name: "Something's not working" }).click();
  const dialog = page.getByRole("dialog", { name: "Something's not working" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** What the dialog handed the fixture's stand-in, or null before a send. */
async function sentInput(page: Page): Promise<unknown> {
  const raw = await page.evaluate(() => document.body.dataset.fixtureFeedback ?? null);
  return raw === null ? null : JSON.parse(raw);
}

test("should show the error in the dialog when the note is empty", async ({ page }) => {
  const dialog = await openFeedback(page);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Tell us what went wrong.");
  await expect(dialog.getByLabel("What went wrong?")).toHaveAttribute("aria-invalid", "true");
  expect(await sentInput(page), "nothing is sent").toBeNull();
});

test("should thank the person and close when the report is sent", async ({ page }) => {
  const dialog = await openFeedback(page, "?scopes=1&team=fixture-shared-0&project=launch#top");
  await dialog.getByLabel("What went wrong?").fill("The Save button does nothing.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks — we got it")).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(await sentInput(page)).toMatchObject({ note: "The Save button does nothing.", path: "/dev/workspace", teamSlug: "fixture-shared-0", viewport: { width: expect.any(Number), height: expect.any(Number) } });
});

test("should keep the typed note and say why when sending fails", async ({ page }) => {
  const dialog = await openFeedback(page, "?feedback=fail");
  await dialog.getByLabel("What went wrong?").fill("Uploads hang at 99%.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Your report was not sent. Check your connection and try again.");
  await expect(dialog.getByLabel("What went wrong?")).toHaveValue("Uploads hang at 99%.");
});

test("should say feedback is unavailable when it is not set up", async ({ page }) => {
  const dialog = await openFeedback(page, "?feedback=unavailable");
  await dialog.getByLabel("What went wrong?").fill("Search is empty.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Feedback isn't available right now.");
});

test("should say when to try again when the person has sent too many", async ({ page }) => {
  const dialog = await openFeedback(page, "?feedback=limit");
  await dialog.getByLabel("What went wrong?").fill("Again: Save does nothing.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Try again in about 30 minutes.");
});

test("should keep the draft when the dialog is closed and opened again", async ({ page }) => {
  const dialog = await openFeedback(page);
  await dialog.getByLabel("What went wrong?").fill("Half a thought");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Something's not working" }).click();
  await expect(page.getByRole("dialog").getByLabel("What went wrong?")).toHaveValue("Half a thought");
});

test("should give the text box and buttons 44px touch targets on phones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone sizes only");
  const dialog = await openFeedback(page);
  // Layout heights, not boxes: the dialog zooms in from 95%, so boxes are short while it opens.
  const height = (element: HTMLElement) => element.offsetHeight;
  for (const name of ["Send", "Cancel"]) {
    expect(await dialog.getByRole("button", { name }).evaluate(height), `${name} is at least 44px tall`).toBeGreaterThanOrEqual(44);
  }
  expect(await dialog.getByLabel("What went wrong?").evaluate(height)).toBeGreaterThanOrEqual(44);
});
