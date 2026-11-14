import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.locator("pre[role=region][tabindex='0']").first()).toBeAttached();
  await expectNoAxeViolations(page, {
    skip: { "landmark-unique": "every scrolling code block is a region named by its language or title, so two shell commands are both \"Command code\"" },
  });
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
