import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expectScrollersSettled } from "./support/scrollers";
import { brandUiIconNames } from "../src/lib/ui/icon-names";

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

type Rgb = [number, number, number];

/** A CSS color as the page paints it, opaque, read from one canvas pixel: a token in scope at the element (`--card`), or one of its computed properties (`fill`). */
function paintedRgb(target: Locator, source: string): Promise<Rgb> {
  return target.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.hidden = true;
    element.appendChild(probe);
    probe.style.color = name.startsWith("--") ? `var(${name})` : getComputedStyle(element).getPropertyValue(name);
    const color = getComputedStyle(probe).color;
    probe.remove();
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue] as [number, number, number];
  }, source);
}

const hexOf = (rgb: Rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast ratio of two opaque colors. */
function contrast(a: Rgb, b: Rgb): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [number, number];
  return (high + 0.05) / (low + 0.05);
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
    // Each surface holds a diagram, which draws after the page loads; scan once every one is drawn at its final width.
    await expectScrollersSettled(whole);
    await expectNoAxeViolations(whole);
  }
});

test("should draw every brand mark at five growing sizes in the text color, each named by its brand, and pass axe", async ({ page }) => {
  await galleryReady(page);
  const marks = specimen(page, "specs", "Brand marks");
  await marks.scrollIntoViewIfNeeded();
  await expectNoAxeViolations(marks);
  const github = marks.getByRole("img", { name: "GitHub" });
  await expect(github).toHaveCount(5);
  await expect(marks.getByRole("img", { name: "Google" })).toHaveCount(5);
  await expect(marks.getByRole("img")).toHaveCount(brandUiIconNames.length * 5);
  const drawn = await github.evaluateAll((icons) => icons.map((icon) => {
    const box = icon.getBoundingClientRect();
    return { width: Math.round(box.width), color: getComputedStyle(icon).color, ink: getComputedStyle(icon.parentElement ?? icon).color, stroke: getComputedStyle(icon).stroke };
  }));
  const widths = drawn.map((icon) => icon.width);
  expect(widths).toEqual([...widths].sort((a, b) => a - b));
  expect(new Set(widths).size).toBe(5);
  for (const icon of drawn) {
    expect(icon.color).toBe(icon.ink);
    expect(icon.stroke).toBe(icon.color);
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

for (const scheme of ["light", "dark"] as const) {
  test(`should show every chart color at 3:1 on every surface, and draw a chart and a diagram in the colors of the surface they sit on, when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await page.addInitScript((value) => {
      try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
    }, scheme);
    await galleryReady(page);
    // On the site palette, and under a theme whose accent is of the other mode on each side.
    for (const matrix of [specimen(page, "specs", "Surfaces and tones"), page.locator('[data-themed-surfaces="ocean"]')]) {
      const outside = await paintedRgb(matrix.getByRole("group", { name: "Surface page" }), "--series-1");
      const boxes = await matrix.getByRole("group", { name: /^Surface / }).all();
      expect(boxes).toHaveLength(15);
      for (const box of boxes) {
        const name = (await box.getAttribute("aria-label")) ?? "";
        // A Box with no surface is clear: it shows the page behind it.
        const fill = await paintedRgb(box, name === "Surface none" ? "--background" : "background-color");
        for (let index = 1; index <= 8; index += 1) {
          expect(contrast(await paintedRgb(box, `--series-${String(index)}`), fill), `${name}: chart color ${String(index)}`).toBeGreaterThanOrEqual(3);
        }
      }
      for (const surface of ["inverse", "primary"]) {
        const box = matrix.getByRole("group", { name: `Surface ${surface}` });
        await box.scrollIntoViewIfNeeded();
        const card = await paintedRgb(box, "--card");
        const ink = await paintedRgb(box, "--foreground");
        expect(contrast(ink, card), `${surface}: text on the surface`).toBeGreaterThanOrEqual(4.5);
        // The bars take the surface's own series colors, not the page's.
        const series = box.locator("svg g[class*='fill-series-']");
        await expect(series).toHaveCount(3);
        expect(await paintedRgb(series.first(), "fill"), `${surface}: the first series`).toEqual(await paintedRgb(box, "--series-1"));
        expect(await paintedRgb(box, "--series-1"), `${surface}: the first series is the surface's`).not.toEqual(outside);
        // The diagram is an image, drawn from the tokens in scope: its boxes are the surface and its words the surface's ink.
        const diagram = box.getByRole("img", { name: `Flow on the ${surface} surface` });
        await expect(diagram).toBeVisible({ timeout: 30_000 });
        const svg = decodeURIComponent((await diagram.getAttribute("src")) ?? "");
        expect(svg, `${surface}: diagram boxes`).toContain(hexOf(card));
        expect(svg, `${surface}: diagram text`).toContain(hexOf(ink));
        expect(contrast(await paintedRgb(box, "--diagram-line"), card), `${surface}: diagram lines`).toBeGreaterThanOrEqual(3);
      }
    }
  });
}

for (const slug of ["box", "icon", "placeholder"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    // The props table scrolls sideways on a phone and becomes a tab stop once it has measured itself, which needs the page interactive.
    await expect(async () => {
      await expectNoAxeViolations(page, {
        skip: {
          "scrollable-region-focusable": {
            on: "details:not([open]) pre",
            reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
          },
        },
      });
    }).toPass({ timeout: 20_000 });
  });
}
