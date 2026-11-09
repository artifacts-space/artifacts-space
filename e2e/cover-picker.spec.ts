import { expect, test } from "@playwright/test";

/**
 * The cover picker (the gallery's "cover picker" specimen, the same
 * component editors get on the artifact page and in the New artifact
 * dialog): keyboard use, gradients that follow the theme, the banner
 * height on phones and desktops, and removal.
 */
test("should show a gradient cover picked with the keyboard, in each theme", async ({ page }, testInfo) => {
  await page.goto("/dev/components#themes");
  const specimen = page.locator('[data-specimen="cover picker"]');
  await specimen.getByRole("button", { name: "Cover: No cover" }).click();

  const group = page.getByRole("radiogroup", { name: "Cover gradient" });
  await expect(group.getByRole("radio", { name: "Stone" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Mist" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(group).toBeHidden();

  const covers = specimen.locator("[data-artifact-cover]");
  await expect(covers).toHaveCount(2);
  await expect(specimen.locator('[data-cover-gradient="mist"]')).toHaveCount(2);
  const expectedHeight = testInfo.project.name === "phone" ? 160 : 240;
  for (const cover of await covers.all()) {
    const box = await cover.boundingBox();
    expect(box?.height).toBe(expectedHeight);
  }

  // The same gradient takes each theme's colors.
  const [inDefault, inOcean] = await Promise.all(
    ["default", "ocean"].map((id) => specimen.locator(`[data-cover-specimen="${id}"] [data-cover-gradient]`).evaluate((node) => getComputedStyle(node).backgroundImage)),
  );
  expect(inDefault).toMatch(/gradient/);
  expect(inDefault).not.toBe(inOcean);

  await specimen.getByRole("button", { name: "Cover: Mist" }).click();
  await expect(page.getByRole("radio", { name: "Mist" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Remove cover" }).click();
  await expect(covers).toHaveCount(0);
});
