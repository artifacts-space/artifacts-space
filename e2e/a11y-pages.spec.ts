import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of whole pages and the sheet grid: axe on the spreadsheet
 * grid with a cell selected (the gallery specimen and the editor fixture),
 * the docs clients page, and the sign-in page, as everyone sees it and with
 * the password field a reviewer address reveals.
 */

/**
 * Contrast findings are design decisions (AGENTS.md, Testing): reported in
 * the pull request, never fixed by changing tokens in a test.
 */
const knownContrast = {
  board: { on: 'ul[aria-label="Labels"] > li.text-tone-warning', reason: "a warning badge's text (--tone-warning on its 12% tint) is 3.52:1, under 4.5:1" },
  docs: { on: ".text-tone-warning, .text-syntax-comment", reason: "--tone-warning text on white (a tool's write badge, a prop's \"required\", 4.06:1) and syntax comments (--syntax-comment, 3.89:1) are under 4.5:1" },
} as const;

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

test("should pass axe on two boards that share column titles, naming each column as a group", async ({ page }) => {
  await page.goto("/dev/components#Board");
  const boards = page.locator("section#Board");
  const sprint = boards.locator('[data-specimen="Sprint"]');
  const next = boards.locator('[data-specimen="Next sprint, same columns"]');
  await expect(sprint.getByRole("heading", { name: /^To do/ })).toBeVisible();
  await expect(next.getByRole("heading", { name: /^To do/ })).toBeVisible();
  // The widest board scrolls at every width: once it is a tab stop, the boards have measured themselves.
  // That needs the whole gallery interactive, which takes longer than the default 5 s on a slow machine.
  await expect(boards.locator('[data-specimen="8 columns, 50 cards, long text"] figure > [role=group]')).toHaveAttribute("tabindex", "0", { timeout: 30_000 });
  // Each column keeps its name for assistive technology, as a group rather than a landmark.
  await expect(sprint.getByRole("group", { name: /^To do\s*, 2 cards$/ })).toHaveCount(1);
  await expect(next.getByRole("group", { name: /^To do\s*, 2 cards$/ })).toHaveCount(1);
  await expect(boards.getByRole("region", { name: /^To do/ })).toHaveCount(0);
  await expectNoAxeViolations(boards, { skip: { "color-contrast": knownContrast.board } });
});

test("should name a scrolling board without a title \"Board\"", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/components#Board");
  const untitled = page.locator('section#Board [data-specimen="Empty columns"] figure');
  await expect(untitled.locator("figcaption")).toHaveCount(0);
  // It takes its own name once it scrolls, which needs the whole gallery interactive.
  await expect(untitled.getByRole("group", { name: "Board", exact: true })).toHaveAttribute("tabindex", "0", { timeout: 30_000 });
});

/**
 * Every box on the page that scrolls sideways and is not a named group with a
 * tab stop (scroll-stop.ts), described by its tag and classes. Empty when the
 * keyboard can reach every one.
 */
async function unreachableSidewaysScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const overflow = getComputedStyle(element).overflowX;
      if ((overflow !== "auto" && overflow !== "scroll") || element.scrollWidth <= element.clientWidth + 1) continue;
      const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (element.getAttribute("role") === "group" && element.tabIndex === 0 && named) continue;
      offenders.push(`${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`);
    }
    return offenders;
  });
}

test("should pass axe on the MCP docs at phone width, with every sideways scroller a named group the keyboard reaches", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/mcp");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("group", { name: "artifacts_create arguments" })).toHaveAttribute("tabindex", "0");
  await expect.poll(() => unreachableSidewaysScrollers(page)).toEqual([]);
  await expectNoAxeViolations(page, { skip: { "color-contrast": knownContrast.docs } });
});

test("should keep a component page's props table reachable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/json-render/components/table");
  await expect(page.getByRole("heading", { level: 1, name: "Table" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Table props" })).toHaveAttribute("tabindex", "0");
  await expect.poll(() => unreachableSidewaysScrollers(page)).toEqual([]);
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
