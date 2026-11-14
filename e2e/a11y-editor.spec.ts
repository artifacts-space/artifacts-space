import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of the rich editor's menus, on the block menu fixture
 * (/dev/block-menu, the real page editor without a database): axe with the
 * slash menu open and with the block menu and its Change submenu open, and
 * the trees a screen reader is given. The editor keeps the textbox role
 * while the slash menu is open, so it points at the list with
 * aria-controls and aria-activedescendant and never says aria-expanded.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const slashMenu = (page: Page) => page.locator("[data-slot=slash-menu]");
const blockMenu = (page: Page) => page.locator("[data-slot=block-menu]");
const changeMenu = (page: Page) => page.locator("[data-slot=block-menu-change]");

/** Focus stays in the editor and moves through the options by aria-activedescendant, so the list itself is never a tab stop. */
const slashMenuScroll = { "scrollable-region-focusable": "the slash menu is driven from the editor with aria-activedescendant; the highlighted option scrolls into view" };

async function openFixture(page: Page) {
  await page.goto("/dev/block-menu");
  await expect(editor(page).getByRole("heading", { name: "Four items waiting for you" })).toBeVisible();
}

/** Starts a new line under the closing paragraph and types "/" there. */
async function openSlashMenu(page: Page) {
  await editor(page).locator(":scope > p").filter({ hasText: "Closing paragraph" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  // Keep the pointer off the menu: hovering an option highlights it.
  await page.mouse.move(0, 0);
  await page.keyboard.type("/");
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
}

/** Opens the block menu from the closing paragraph's grip: hovered into view with a mouse, always shown on touch. */
async function openBlockMenu(page: Page, isMobile: boolean) {
  const block = editor(page).locator(":scope > p").filter({ hasText: "Closing paragraph" });
  await block.scrollIntoViewIfNeeded();
  if (!isMobile) await block.hover({ position: { x: 8, y: 6 } });
  await page.getByRole("button", { name: "Block actions" }).last().click();
  await expect(blockMenu(page).getByRole("menu", { name: "Text block" })).toBeVisible();
}

test("should pass axe on the editor with no menu open", async ({ page }) => {
  await openFixture(page);
  await expectNoAxeViolations(editor(page));
});

test("should pass axe with the slash menu open and an option highlighted", async ({ page }) => {
  await openFixture(page);
  await openSlashMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Heading 2/ })).toHaveAttribute("aria-selected", "true");
  await expectNoAxeViolations(editor(page).or(slashMenu(page)), { skip: slashMenuScroll });
});

test("should pass axe with the slash menu filtered to nothing", async ({ page }) => {
  await openFixture(page);
  await openSlashMenu(page);
  await page.keyboard.type("zzz");
  await expect(slashMenu(page)).toContainText("No blocks match.");
  await expectNoAxeViolations(editor(page).or(slashMenu(page)));
});

test("should point the editor at the slash menu's highlighted option without aria-expanded", async ({ page }) => {
  await openFixture(page);
  await expect(editor(page)).toHaveAttribute("aria-autocomplete", "list");
  await openSlashMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(editor(page)).not.toHaveAttribute("aria-expanded");
  await expect(editor(page)).toHaveAttribute("aria-controls", "rich-editor-slash-menu");
  const active = await editor(page).getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  await expect(page.locator(`#${String(active)}`)).toHaveAccessibleName(/Heading 2/);
  await page.keyboard.press("Escape");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(editor(page)).not.toHaveAttribute("aria-controls");
  await expect(editor(page)).not.toHaveAttribute("aria-activedescendant");
});

test("should keep the highlighted option in view when the arrow keys move past the menu's edge", async ({ page }) => {
  await openFixture(page);
  await openSlashMenu(page);
  await page.keyboard.press("End");
  const last = page.getByRole("option", { name: /File/ });
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(last).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Home");
  await expect(page.getByRole("option", { name: /Heading 1/ })).toBeInViewport({ ratio: 1 });
});

test("should give the slash menu a listbox tree with the highlighted option selected", async ({ page }) => {
  await openFixture(page);
  await openSlashMenu(page);
  await page.keyboard.type("list");
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toMatchAriaSnapshot(`
    - listbox "Insert a block":
      - option "Bulleted list -" [selected]
      - option "Numbered list 1."
      - option "Task list [ ]"
  `);
});

test("should pass axe with the block menu open", async ({ page, isMobile }) => {
  await openFixture(page);
  await openBlockMenu(page, isMobile);
  await expectNoAxeViolations(blockMenu(page));
});

test("should pass axe with the block menu's Change submenu open", async ({ page, isMobile }) => {
  await openFixture(page);
  await openBlockMenu(page, isMobile);
  const change = blockMenu(page).getByRole("menuitem", { name: "Change" });
  if (isMobile) await change.click();
  else await change.hover();
  await expect(changeMenu(page).getByRole("menuitemradio", { name: "Text" })).toBeVisible();
  await expectNoAxeViolations(blockMenu(page).or(changeMenu(page)));
});

test("should give the block menu and its Change submenu a menu tree", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones open Change in the same sheet; the tree is the same.");
  await openFixture(page);
  await openBlockMenu(page, false);
  // Shortcut hints differ by platform (⌘ on a Mac, Ctrl elsewhere), so rows are matched by their names.
  await expect(blockMenu(page).getByRole("menu", { name: "Text block" })).toMatchAriaSnapshot(`
    - menu "Text block":
      - group "Text":
        - menuitem "Change"
        - menuitem "Color"
      - separator
      - group:
        - menuitem /^Copy link to block/
        - menuitem /^Duplicate/
        - menuitem /^Move up/
        - menuitem /^Move down/ [disabled]
        - menuitem /^Delete/
      - separator
      - group:
        - menuitem /^Comment/
  `);
  await blockMenu(page).getByRole("menuitem", { name: "Change" }).hover();
  await expect(changeMenu(page).getByRole("menu")).toMatchAriaSnapshot(`
    - menu "Change to":
      - group:
        - menuitemradio "Text" [checked]
        - menuitemradio "Heading 1"
        - menuitemradio "Heading 2"
        - menuitemradio "Heading 3"
        - menuitemradio "Bulleted list"
        - menuitemradio "Numbered list"
        - menuitemradio "Task list"
        - menuitemradio "Code block"
        - menuitemradio "Quote"
  `);
});
