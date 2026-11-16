import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/**
 * Catching up: an open canvas takes a newer save when its tab comes back,
 * without a reload, says who changed what, and marks the changed frames.
 * The fixture's "agent" renames the second frame and removes the third
 * (/dev/editor?kind=canvas&catchup=agent, no database). In the /app
 * fixture the "agent" saves a short interface over the Long ui fixture.
 */

const notice = (page: Page) => page.locator("[data-slot=catch-up-notice]");
const frame = (page: Page, id: string) => page.locator(`[data-canvas-page-board] [data-canvas-frame="${id}"]`);
const checks = (page: Page) => page.evaluate(() => window.fixtureCatchUpChecks ?? 0);

/** The tab comes back: the window gets the focus again. */
const comeBack = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event("focus")); });

async function openCanvas(page: Page, query = "&catchup=agent") {
  await page.goto(`/dev/editor?kind=canvas${query}`);
  await expect(page.getByRole("banner").getByRole("button", { name: "More actions" })).toBeEnabled();
  await expect(frame(page, "ticket")).toBeVisible();
}

test("should show an agent's save when the tab comes back, say who changed what, and mark the changed frame", async ({ page }) => {
  await openCanvas(page);
  await expect(frame(page, "inbox").locator("[data-canvas-frame-label]")).toContainText("2. Inbox");
  await expect(notice(page)).toHaveCount(0);

  await comeBack(page);
  await expect(notice(page)).toContainText('Claude Code changed the frame "2. Inbox, triaged", and removed 1 frame. It is outlined below.');
  // The board shows the agent's version: the frame has its new name, and the removed frame is gone.
  await expect(frame(page, "inbox").locator("[data-canvas-frame-label]")).toContainText("2. Inbox, triaged");
  await expect(frame(page, "ticket")).toHaveCount(0);
  // Only the changed frame is marked, in words and with an outline.
  await expect(frame(page, "inbox")).toHaveAttribute("data-frame-changed", "");
  await expect(frame(page, "inbox").locator("[data-canvas-frame-label]")).toContainText("Changed");
  await expect(frame(page, "inbox")).toHaveCSS("outline-style", "solid");
  await expect(frame(page, "sign-in")).not.toHaveAttribute("data-frame-changed");
  await expect(frame(page, "sign-in")).toHaveCSS("outline-style", "none");
  await expectNoAxeViolations(page.locator("main"));

  await notice(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(frame(page, "inbox")).not.toHaveAttribute("data-frame-changed");
  await expect(frame(page, "inbox").locator("[data-canvas-frame-label]")).toContainText("2. Inbox, triaged");
});

test("should ask nothing while the editor holds unsaved changes, and ask again once they are saved", async ({ page }) => {
  await openCanvas(page);
  await page.getByRole("button", { name: "Edit source" }).click();
  const source = page.getByRole("textbox", { name: "Artifact source" });
  const typed = (await source.inputValue()).replace('"1. Sign in"', '"1. Welcome"');
  await source.fill(typed);

  await comeBack(page);
  expect(await checks(page), "nothing is asked over unsaved typing").toBe(0);
  await expect(notice(page)).toHaveCount(0);
  await expect(source).toHaveValue(typed);

  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toContainText("Saved", { timeout: 12_000 });
  await comeBack(page);
  await expect.poll(() => checks(page)).toBe(1);
});

test("should ask nothing on a page that did not turn catching up on", async ({ page }) => {
  await openCanvas(page, "");
  await comeBack(page);
  expect(await checks(page)).toBe(0);
  await expect(notice(page)).toHaveCount(0);
});

test("should mark the changed frame on the full-screen board too", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no board, so no full screen");
  await openCanvas(page);
  await comeBack(page);
  await expect(notice(page)).toBeVisible();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  const screen = page.getByRole("dialog", { name: "Canvas, full screen" });
  await expect(screen.locator('[data-canvas-frame="inbox"]')).toHaveAttribute("data-frame-changed", "");
  await expect(screen.locator('[data-canvas-frame="sign-in"]')).not.toHaveAttribute("data-frame-changed");
});

test("should show an agent's save of an interface in the /app editor when the tab comes back", async ({ page, isMobile }) => {
  test.skip(isMobile, "the /app editor's wiring is the same on a phone; its layout is checked elsewhere");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/workspace?artifact=fixtureworkspace0000ui&catchup=agent");
  const editor = page.getByRole("region", { name: "Edit Long ui fixture" });
  await expect(editor).toBeVisible();
  await expect(editor.getByText("Ship on Friday.")).toHaveCount(0);

  // The server's HTML is on screen before the editor listens: come back until the editor has asked once.
  await expect.poll(async () => { await comeBack(page); return checks(page); }).toBe(1);
  await expect(editor.locator("[data-slot=catch-up-notice]")).toContainText("Claude Code changed this interface. This is the new version.");
  await expect(editor.getByText("Ship on Friday.")).toBeVisible();
  await expectNoAxeViolations(editor.locator("[data-slot=catch-up-notice]"));

  await editor.locator("[data-slot=catch-up-notice]").getByRole("button", { name: "Dismiss" }).click();
  await expect(editor.locator("[data-slot=catch-up-notice]")).toHaveCount(0);
  await expect(editor.getByText("Ship on Friday.")).toBeVisible();
});
