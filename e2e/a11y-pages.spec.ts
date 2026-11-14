import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of whole pages and the sheet grid: axe on the spreadsheet
 * grid with a cell selected (the gallery specimen and the editor fixture),
 * the docs clients page, and the sign-in page, as everyone sees it and with
 * the password field a reviewer address reveals.
 */

const linkButton = (page: Page) => page.getByRole("button", { name: "Email me a sign-in link" });

test("should pass axe on the sheet grid with a cell selected", async ({ page }) => {
  await page.goto("/dev/components#formats");
  const grid = page.locator('[data-specimen="csv · Sheet at the size limit"]').getByRole("grid", { name: "CSV table" });
  await grid.scrollIntoViewIfNeeded();
  await grid.getByRole("gridcell", { name: "r1c1", exact: true }).click();
  await expect(grid.getByRole("gridcell", { name: "r1c1", exact: true })).toHaveAttribute("aria-selected", "true");
  await expectNoAxeViolations(grid);
});

test("should pass axe on the sheet editor", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid").first();
  await expect(grid).toBeVisible();
  await grid.getByRole("gridcell").first().click();
  await expectNoAxeViolations(page);
});

test("should pass axe on the docs clients page", async ({ page }) => {
  await page.goto("/docs/clients");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // A code block that scrolls becomes a tab stop once it has measured itself in the browser.
  await expect(page.locator("pre[role=group][tabindex='0']").first()).toBeAttached();
  await expectNoAxeViolations(page);
});

test("should make a scrolling code block a named group the keyboard scrolls, never a landmark", async ({ page }) => {
  await page.goto("/docs/clients");
  const scrolling = page.locator("pre[role=group][tabindex='0']").first();
  await expect(scrolling).toBeAttached();
  await expect(scrolling).toHaveAccessibleName(/ code$/);
  // Ten shell commands are ten "Command code" groups, not ten landmarks with one name.
  await expect(page.getByRole("region", { name: / code$/ })).toHaveCount(0);
  await scrolling.scrollIntoViewIfNeeded();
  await scrolling.focus();
  await expect(scrolling).toBeFocused();
  const before = await scrolling.evaluate((element) => element.scrollLeft + element.scrollTop);
  await page.keyboard.press(await scrolling.evaluate((element) => (element.scrollWidth > element.clientWidth ? "ArrowRight" : "ArrowDown")));
  await expect.poll(() => scrolling.evaluate((element) => element.scrollLeft + element.scrollTop)).toBeGreaterThan(before);
});

test("should pass axe on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(linkButton(page)).toBeVisible();
  await expectNoAxeViolations(page);
});

test("should pass axe on the sign-in form with the password field a reviewer address reveals", async ({ page }) => {
  await page.goto("/dev/sign-in");
  await expect(linkButton(page)).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill("reviewer@example.com");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
});
