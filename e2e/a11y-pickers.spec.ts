import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of the theme picker and the cover picker (the gallery's
 * specimens, the same components editors get on the artifact page): axe
 * on each open picker, and the tree a screen reader is given. Picking a
 * swatch applies it and closes the picker, so each picker is a listbox:
 * arrow keys move focus, Enter or a click picks. A theme option is named by
 * what its swatch shows (the theme, then its fonts) and described by what
 * the theme is for; with team presets or a theme of its own, the options sit
 * in groups named by their headings.
 */

const themeSpecimen = (page: Page) => page.locator('[data-specimen="theme picker"]');
const groupedSpecimen = (page: Page) => page.locator('[data-specimen="theme picker · groups"]');
const coverSpecimen = (page: Page) => page.locator('[data-specimen="cover picker"]');

async function openGallery(page: Page) {
  await page.goto("/dev/components#themes");
  await expect(themeSpecimen(page)).toBeVisible();
}

test("should pass axe with the theme picker open", async ({ page }) => {
  await openGallery(page);
  await themeSpecimen(page).getByRole("button", { name: /Theme: Default/ }).click();
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: "Default Geist Sans" })).toBeFocused();
  await expectNoAxeViolations(page.getByRole("dialog", { name: "Theme" }));
});

test("should pass axe with the grouped theme picker open", async ({ page }) => {
  await openGallery(page);
  await groupedSpecimen(page).getByRole("button", { name: /Grouped theme: Custom/ }).click();
  await expect(page.getByRole("listbox", { name: "Artifact theme" }).getByRole("option", { name: "Custom DM Sans" })).toBeFocused();
  await expectNoAxeViolations(page.getByRole("dialog", { name: "Theme" }));
});

test("should give the theme picker a listbox tree with the current theme selected", async ({ page }) => {
  await openGallery(page);
  await themeSpecimen(page).getByRole("button", { name: /Theme: Default/ }).click();
  await expect(page.getByRole("dialog", { name: "Theme" })).toMatchAriaSnapshot(`
    - dialog "Theme":
      - heading "Theme"
      - paragraph: Colors and fonts for this artifact and the page behind it.
      - listbox "Artifact theme":
        - option "Default Geist Sans" [selected]
        - option "Paper Work Sans"
        - option "Graphite IBM Plex Sans"
        - option "Ink Inter"
        - option "Ocean DM Sans"
        - option "Forest Manrope"
        - option "Editorial Instrument Serif · Source Serif 4"
        - option "Classic Roboto"
  `);
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: "Paper Work Sans" })).toHaveAccessibleDescription("Cream pages, sepia ink, and a sienna accent, in Work Sans.");
});

test("should put the grouped theme picker's options in groups named by their headings", async ({ page }) => {
  await openGallery(page);
  await groupedSpecimen(page).getByRole("button", { name: /Grouped theme: Custom/ }).click();
  await expect(page.getByRole("listbox", { name: "Artifact theme" })).toMatchAriaSnapshot(`
    - listbox "Artifact theme":
      - group "This artifact":
        - option "Custom DM Sans" [selected]
      - group "Team default":
        - option "Team default Brand"
      - group "Team · Fixture team":
        - option "Brand Inter"
        - option "Reports Instrument Serif · Source Serif 4"
      - group "Built-in":
        - option "Default Geist Sans"
        - option "Paper Work Sans"
        - option "Graphite IBM Plex Sans"
        - option "Ink Inter"
        - option "Ocean DM Sans"
        - option "Forest Manrope"
        - option "Editorial Instrument Serif · Source Serif 4"
        - option "Classic Roboto"
  `);
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: "Team default Brand" })).toHaveAccessibleDescription("Set by the team");
  await expect(picker.getByRole("option", { name: "Brand Inter" })).toHaveAccessibleDescription("Our colors for anything a customer reads.");
  await expect(picker.getByRole("option", { name: "Reports Instrument Serif · Source Serif 4" })).toHaveAccessibleDescription("A team preset");
});

test("should move focus across groups with arrow keys and pick from another group", async ({ page }) => {
  await openGallery(page);
  const trigger = groupedSpecimen(page).getByRole("button", { name: /Grouped theme: Custom/ });
  await trigger.click();
  const picker = page.getByRole("listbox", { name: "Artifact theme" });
  await expect(picker.getByRole("option", { name: "Custom DM Sans" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("group", { name: "Team default" }).getByRole("option", { name: "Team default Brand" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("group", { name: "Team · Fixture team" }).getByRole("option", { name: "Reports Instrument Serif · Source Serif 4" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(picker.getByRole("group", { name: "Built-in" }).getByRole("option", { name: "Classic Roboto" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(picker.getByRole("option", { name: "Custom DM Sans" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(groupedSpecimen(page).getByRole("button", { name: "Grouped theme: Brand" })).toBeVisible();
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
  await expect(picker.getByRole("option", { name: "Default Geist Sans" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("option", { name: "Paper Work Sans" })).toBeFocused();
  await expect(picker.getByRole("option", { name: "Paper Work Sans" })).toHaveAttribute("aria-selected", "false");
  await expect(picker.getByRole("option", { name: "Default Geist Sans" })).toHaveAttribute("aria-selected", "true");
  await expect(themeSpecimen(page).locator("[data-picker-scope]")).toHaveAttribute("data-picker-scope", "default");
});
