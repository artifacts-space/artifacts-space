import { expect, test } from "@playwright/test";

/**
 * The artifact theme picker (the gallery's "theme picker" specimen, the
 * same component editors get on the artifact page and in the New artifact
 * dialog): keyboard use, and the scope it drives rendering the chosen theme.
 */
test("should apply a preset picked with the keyboard when an editor opens the picker", async ({ page }) => {
  await page.goto("/dev/components#themes");
  const specimen = page.locator('[data-specimen="theme picker"]');
  const scope = specimen.locator("[data-picker-scope]");
  await expect(scope).toHaveAttribute("data-picker-scope", "default");

  await specimen.getByRole("button", { name: /Theme: Default/ }).click();
  const group = page.getByRole("radiogroup", { name: "Artifact theme" });
  await expect(group).toBeVisible();
  const defaultOption = group.getByRole("radio", { name: /^Default:/ });
  await expect(defaultOption).toHaveAttribute("aria-checked", "true");
  await expect(defaultOption).toBeFocused();

  // Default, Paper, Graphite, Ink, Ocean, Forest, Editorial, Classic in two columns: Right moves to Paper.
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: /^Paper:/ })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(group).toBeHidden();
  await expect(scope).toHaveAttribute("data-picker-scope", "paper");
  await expect(scope).toHaveCSS("font-family", /^"Work Sans"/);
  await expect(specimen.getByRole("button", { name: /Theme: Paper/ })).toBeVisible();

  await specimen.getByRole("button", { name: /Theme: Paper/ }).click();
  await expect(page.getByRole("radio", { name: /^Paper:/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: /^Classic:/ })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(scope).toHaveAttribute("data-picker-scope", "classic");
  await expect(scope).toHaveCSS("font-family", /^Roboto/);
});
