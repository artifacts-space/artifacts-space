import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of the theme picker and the cover picker (the gallery's
 * specimens, the same components editors get on the artifact page): axe
 * on each open picker, and the tree a screen reader is given. Picking a
 * swatch applies it and closes the picker, so each picker is a listbox:
 * arrow keys move focus, Enter or a click picks.
 */

const themeSpecimen = (page: Page) => page.locator('[data-specimen="theme picker"]');
const coverSpecimen = (page: Page) => page.locator('[data-specimen="cover picker"]');

async function openGallery(page: Page) {
  await page.goto("/dev/components#themes");
  await expect(themeSpecimen(page)).toBeVisible();
}

test("should pass axe with the theme picker open", async ({ page }) => {
  await openGallery(page);
  await themeSpecimen(page).getByRole("button", { name: /Theme: Default/ }).click();
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: /^Default:/ })).toBeFocused();
  await expectNoAxeViolations(page.getByRole("dialog", { name: "Theme" }), {
    skip: { "label-content-name-mismatch": "each swatch is named \"<theme>: <description>\", which leaves out its visible font line; renaming them is a separate change" },
  });
});

test("should give the theme picker a listbox tree with the current theme selected", async ({ page }) => {
  await openGallery(page);
  await themeSpecimen(page).getByRole("button", { name: /Theme: Default/ }).click();
  await expect(page.getByRole("dialog", { name: "Theme" })).toMatchAriaSnapshot(`
    - dialog "Theme":
      - heading "Theme"
      - paragraph: Colors and fonts for this artifact and the page behind it.
      - listbox "Artifact theme":
        - option /^Default:/ [selected]
        - option /^Paper:/
        - option /^Graphite:/
        - option /^Ink:/
        - option /^Ocean:/
        - option /^Forest:/
        - option /^Editorial:/
        - option /^Classic:/
  `);
});

test("should pass axe with the cover picker open", async ({ page }) => {
  await openGallery(page);
  await coverSpecimen(page).getByRole("button", { name: "Cover: No cover" }).click();
  await expect(page.getByRole("listbox", { name: "Cover gradient" }).getByRole("option", { name: "Stone" })).toBeFocused();
  await expectNoAxeViolations(page.getByRole("dialog", { name: "Cover" }));
});

test("should give the cover picker a listbox tree with the current cover selected", async ({ page }) => {
  await openGallery(page);
  await coverSpecimen(page).getByRole("button", { name: "Cover: No cover" }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await coverSpecimen(page).getByRole("button", { name: "Cover: Mist" }).click();
  await expect(page.getByRole("listbox", { name: "Cover gradient" })).toMatchAriaSnapshot(`
    - listbox "Cover gradient":
      - option "Stone"
      - option "Mist" [selected]
      - option "Tide"
      - option "Meadow"
      - option "Dawn"
      - option "Ember"
      - option "Bloom"
      - option "Dusk"
  `);
});

test("should move focus with arrow keys and leave the theme as it was until one is picked", async ({ page }) => {
  await openGallery(page);
  await themeSpecimen(page).getByRole("button", { name: /Theme: Default/ }).click();
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: /^Default:/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("option", { name: /^Paper:/ })).toBeFocused();
  await expect(picker.getByRole("option", { name: /^Paper:/ })).toHaveAttribute("aria-selected", "false");
  await expect(picker.getByRole("option", { name: /^Default:/ })).toHaveAttribute("aria-selected", "true");
  await expect(themeSpecimen(page).locator("[data-picker-scope]")).toHaveAttribute("data-picker-scope", "default");
});
