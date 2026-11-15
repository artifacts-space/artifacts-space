import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * The pieces a screen is drawn with (Box, Icon, Placeholder, and the screen
 * props of Text, Heading, and Link): axe on their gallery groups and on the
 * two composed specimens, a Box that follows the width of its container and
 * not the window, a scrolling row the keyboard can reach, and the surfaces
 * that switch the palette inside them. Color contrast of every surface with
 * every tone is read by e2e/a11y-contrast.spec.ts, which scans the gallery.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery is interactive once the scrolling row has measured itself and become a tab stop. */
async function galleryReady(page: Page) {
  await page.goto("/dev/components#Box");
  await expect(specimen(page, "Box", "Scrolling row").getByRole("group", { name: "Customer logos" })).toHaveAttribute("tabindex", "0", { timeout: 30_000 });
}

const computed = (target: Locator, property: string) => target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

/** True when the element's color (any CSS color syntax) is nearer white than black, read by painting it on a canvas. */
function isLight(target: Locator, property: string): Promise<boolean> {
  return target.evaluate((element, name) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    context.fillStyle = getComputedStyle(element).getPropertyValue(name);
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
    return (red + green + blue) / 3 > 127;
  }, property);
}

test("should pass axe on the Box, Icon, and Placeholder groups of the gallery", async ({ page }) => {
  await galleryReady(page);
  for (const group of ["Box", "Icon", "Placeholder"]) {
    const section = page.locator(`section#${group}`);
    await section.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(section);
  }
});

test("should pass axe on every surface with every tone, and on a composed landing page", async ({ page }) => {
  await galleryReady(page);
  for (const name of ["Surfaces and tones", "Landing page"]) {
    const whole = specimen(page, "specs", name);
    await whole.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(whole);
  }
});

test("should name a Box with a label as a group, and a scrolling row as a group the keyboard can reach", async ({ page }) => {
  await galleryReady(page);
  const row = specimen(page, "Box", "Scrolling row").getByRole("group", { name: "Customer logos" });
  // The row holds twelve logos: wider than its box at every viewport, so it scrolls inside itself and the page does not.
  expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await row.focus();
  await expect(row).toBeFocused();
  await expect(specimen(page, "specs", "Landing page").getByRole("group", { name: "Site navigation" })).toHaveCount(1);
});

test("should follow the width of its container, not the window, when a row has stackBelow", async ({ page, isMobile }) => {
  test.skip(isMobile, "the window is the narrow one there; this proves a narrow container in a wide window");
  await galleryReady(page);
  const frame = specimen(page, "Box", "Stacks below md");
  const row = frame.locator("[class*='@2xl/ui:flex-row']");
  await expect(row).toHaveCount(1);
  expect(await computed(row, "flex-direction")).toBe("row");
  // A phone-sized frame in a desktop window: the same Box turns into a column.
  await frame.evaluate((element) => { element.style.width = "390px"; });
  await expect.poll(() => computed(row, "flex-direction")).toBe("column");
  expect(page.viewportSize()?.width).toBeGreaterThanOrEqual(1024);
});

test("should hide and show a Box by the width of its container", async ({ page, isMobile }) => {
  test.skip(isMobile, "the window is the narrow one there; this proves a narrow container in a wide window");
  await galleryReady(page);
  const wideOnly = specimen(page, "Box", "Hidden below md");
  const narrowOnly = specimen(page, "Box", "Hidden above md");
  await expect(wideOnly.getByText("Only shown on a wide page column.")).toBeVisible();
  await expect(narrowOnly.getByText("Only shown on a narrow page column.")).toBeHidden();
  for (const frame of [wideOnly, narrowOnly]) await frame.evaluate((element) => { element.style.width = "390px"; });
  await expect(wideOnly.getByText("Only shown on a wide page column.")).toBeHidden();
  await expect(narrowOnly.getByText("Only shown on a narrow page column.")).toBeVisible();
});

test("should show the phone layout of the landing page on a phone, with the menu links hidden", async ({ page, isMobile }) => {
  await galleryReady(page);
  const landing = specimen(page, "specs", "Landing page");
  await landing.scrollIntoViewIfNeeded();
  const pricing = landing.getByText("Pricing", { exact: true });
  if (isMobile) await expect(pricing).toBeHidden();
  else await expect(pricing).toBeVisible();
  await expect(landing.getByRole("heading", { level: 1, name: "Know what is on every shelf" })).toBeVisible();
  await expect(landing.getByRole("img", { name: "Dashboard screenshot" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`should switch the palette inside an inverse surface when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await page.addInitScript((value) => {
      try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
    }, scheme);
    await galleryReady(page);
    const matrix = specimen(page, "specs", "Surfaces and tones");
    const plain = matrix.getByRole("group", { name: "Surface page" });
    const inverse = matrix.getByRole("group", { name: "Surface inverse" });
    const pageIsLight = await isLight(plain, "background-color");
    expect(pageIsLight).toBe(scheme === "light");
    // The band is the other mode's page, and its body and muted text sit on the far side of it.
    expect(await isLight(inverse, "background-color")).toBe(!pageIsLight);
    expect(await isLight(inverse.getByText("Body text on the inverse surface."), "color")).toBe(pageIsLight);
    expect(await isLight(inverse.getByText("Muted text, for secondary detail."), "color")).toBe(pageIsLight);
    // Under a theme the band takes the theme's other palette, not the site's.
    const themed = page.locator('[data-themed-surfaces="ocean"]');
    const themedInverse = themed.getByRole("group", { name: "Surface inverse" });
    await themedInverse.scrollIntoViewIfNeeded();
    expect(await computed(themedInverse, "background-color")).not.toBe(await computed(inverse, "background-color"));
    expect(await isLight(themedInverse, "background-color")).toBe(!pageIsLight);
  });
}

for (const slug of ["box", "icon", "placeholder"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
}
