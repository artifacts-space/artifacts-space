import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";
import { readColors } from "./support/colors";

/*
 * Button `pressed` and the accent tone. A pressed toggle says it is on to
 * screen readers and shows it; it is scanned with axe on and off, on the
 * desktop and the phone. Its colors are measured on every Box surface of
 * the "Surfaces and tones" specimen, on the site palette and under two
 * themes, in light and in dark: the label against the pressed fill at
 * 4.5:1 and the edge against the surface at 3:1, at rest and under the
 * pointer. The accent tone is read there too: the theme's own accent as
 * text, the site's own blue on the site palette, and the surface's own
 * text color on a primary surface. In forced colors, which replace every
 * page color, a pressed toggle keeps a mark of its own on each variant.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery is ready once React has hydrated it, which its ready mark says. */
async function galleryReady(page: Page, group: string) {
  await page.goto(`/dev/components#${group}`);
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
}

/** Holds the page in one color scheme for the whole test, in every frame it opens. */
async function useScheme(page: Page, scheme: "light" | "dark") {
  await page.addInitScript((value) => {
    try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
  }, scheme);
}

const docsPreviewSkip = {
  "scrollable-region-focusable": {
    on: "details:not([open]) pre",
    reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
  },
};

test("should flip aria-pressed with one press, show the button pressed, and pass axe on and off", async ({ page }) => {
  await galleryReady(page, "specs");
  const toggle = specimen(page, "specs", "Pressed toggle");
  await toggle.scrollIntoViewIfNeeded();
  const bold = toggle.getByRole("button", { name: "Bold" });
  const sample = toggle.getByText("The quick note reads heavier while Bold is on.");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  const restFill = await bold.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expectNoAxeViolations(toggle);

  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(sample).toHaveCSS("font-weight", "600");
  // The look follows: a filled button, not the outline it was.
  expect(await bold.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(restFill);
  // A toggle stays in place and keeps the focus, so the same press turns it off.
  await expect(bold).toBeFocused();
  await expect(toggle).toMatchAriaSnapshot(`
    - group "Text style":
      - button "Bold" [pressed]
      - paragraph: The quick note reads heavier while Bold is on.
  `);
  await expectNoAxeViolations(toggle);

  await bold.press("Space");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(sample).toHaveCSS("font-weight", "400");
  // Away from the pointer it is the outline it was at the start.
  await page.mouse.move(0, 0);
  await expect.poll(() => bold.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restFill);
});

test("should pass axe on the Button, Badge, Text, and Icon groups of the gallery, with every pressed and accent fixture drawn", async ({ page }) => {
  await galleryReady(page, "Button");
  await expect(specimen(page, "Button", "Toggle, pressed, outline").getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(specimen(page, "Button", "Toggle, not pressed").getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await expect(specimen(page, "Button", "Toggle, pressed, ghost icon only").getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  for (const group of ["Button", "Badge", "Text", "Icon"]) {
    const section = page.locator(`section#${group}`);
    await section.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(section);
  }
});

/** What forced colors leave of a button's look: its edge, its fill, and its outline, as computed. */
function forcedLook(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`, fill: style.backgroundColor, outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`, words: style.color };
  });
}

const forcedPairs = [
  { variant: "outline", rest: "Toggle, not pressed", pressed: "Toggle, pressed, outline", name: "Bold" },
  { variant: "secondary", rest: "Toggle, not pressed, secondary with an icon", pressed: "Toggle, pressed, secondary with an icon", name: "Starred" },
  { variant: "ghost", rest: "Toggle, not pressed, ghost icon only", pressed: "Toggle, pressed, ghost icon only", name: "Saved" },
] as const;

test("should keep a pressed toggle apart from the same button at rest in forced colors, on every variant a toggle takes", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await galleryReady(page, "Button");
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  for (const { variant, rest, pressed, name } of forcedPairs) {
    const off = specimen(page, "Button", rest).getByRole("button", { name });
    const on = specimen(page, "Button", pressed).getByRole("button", { name });
    await expect(off).toHaveAttribute("aria-pressed", "false");
    await expect(on).toHaveAttribute("aria-pressed", "true");
    const [atRest, whenPressed] = [await forcedLook(off), await forcedLook(on)];
    // The browser has replaced the page colors, so what tells them apart is the system's selected pair on the edge and the fill.
    expect(whenPressed.border, `${variant}: the edge, pressed and at rest`).not.toBe(atRest.border);
    expect(whenPressed.fill, `${variant}: the fill, pressed and at rest`).not.toBe(atRest.fill);
    // Under the pointer it stays marked: no hover fill of the variant takes the mark back.
    await on.hover();
    expect((await forcedLook(on)).fill, `${variant}: the fill under the pointer`).toBe(whenPressed.fill);
    await page.mouse.move(0, 0);
  }
});

/** The colors of a pressed button as painted, each composited on what lies under it, as [r, g, b]. */
interface PressedColors {
  surface: number[];
  fill: number[];
  edge: number[];
  label: number[];
}

function readPressed(button: Locator): Promise<PressedColors> {
  return button.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    const paint = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const chain: Element[] = [];
    for (let node: Element | null = element.parentElement; node; node = node.parentElement) chain.unshift(node);
    paint("white");
    let surface: number[] = [];
    for (const node of chain) surface = paint(getComputedStyle(node).backgroundColor);
    const under = `rgb(${surface.join(",")})`;
    const style = getComputedStyle(element);
    const fill = paint(style.backgroundColor);
    const onFill = (color: string) => { paint(`rgb(${fill.join(",")})`); return paint(color); };
    const edge = (() => { paint(under); return paint(style.borderTopColor); })();
    return { surface, fill, edge, label: onFill(style.color) };
  });
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const luminance = (rgb: readonly number[]) => {
    const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The lowest of each pair a pressed button must hold, as measured. */
interface PressedReading {
  label: number;
  edge: number;
}

function pairsOf(colors: PressedColors): PressedReading {
  return {
    label: contrast(colors.label, colors.fill),
    // The edge is the border, and the fill beside it: both must show on the surface.
    edge: Math.min(contrast(colors.edge, colors.surface), contrast(colors.fill, colors.surface)),
  };
}

/** Each pressed button of a surface box, at rest and under the pointer. */
async function expectPressedReads(page: Page, box: Locator, lowest: PressedReading) {
  const name = (await box.getAttribute("aria-label")) ?? "";
  for (const label of ["Italic", "Starred", "Saved"]) {
    const button = box.getByRole("button", { name: label });
    await button.scrollIntoViewIfNeeded();
    await expect(button, `${name}: ${label}`).toHaveAttribute("aria-pressed", "true");
    const rest = await readPressed(button);
    // Transitions are off in this test, so the fill under the pointer is there once the browser has drawn the hover.
    // A diagram higher on the page can still be drawing and move the button, so each try points at it again.
    let hover = rest;
    await expect.poll(async () => {
      await button.hover();
      hover = await readPressed(button);
      return hover.fill.join(",");
    }, { message: `${name}: ${label}'s fill moves under the pointer` }).not.toBe(rest.fill.join(","));
    for (const [state, colors] of [["at rest", rest], ["under the pointer", hover]] as const) {
      const pairs = pairsOf(colors);
      const where = `${name}, ${label} ${state}: label ${colors.label.join(",")} on ${colors.fill.join(",")}, edge ${colors.edge.join(",")} on ${colors.surface.join(",")}`;
      expect(pairs.label, where).toBeGreaterThanOrEqual(4.5);
      expect(pairs.edge, where).toBeGreaterThanOrEqual(3);
      lowest.label = Math.min(lowest.label, pairs.label);
      lowest.edge = Math.min(lowest.edge, pairs.edge);
    }
    await page.mouse.move(0, 0);
  }
}

const matrices = [
  { theme: "site", find: (page: Page) => specimen(page, "specs", "Surfaces and tones") },
  { theme: "ocean", find: (page: Page) => page.locator('[data-themed-surfaces="ocean"]') },
  { theme: "editorial", find: (page: Page) => page.locator('[data-themed-surfaces="editorial"]') },
] as const;

for (const scheme of ["light", "dark"] as const) {
  for (const { theme, find } of matrices) {
    test(`should hold a pressed Button's label at 4.5:1 and its edge at 3:1 on every surface, at rest and under the pointer, under the ${theme} palette when the site is ${scheme}`, async ({ page, isMobile }) => {
      test.skip(isMobile, "the same colors as the desktop run");
      await useScheme(page, scheme);
      await galleryReady(page, "specs");
      await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
      const boxes = await find(page).getByRole("group", { name: /^Surface / }).all();
      expect(boxes).toHaveLength(15);
      const lowest: PressedReading = { label: Infinity, edge: Infinity };
      for (const box of boxes) await expectPressedReads(page, box, lowest);
      test.info().annotations.push({ type: "lowest contrast", description: `${theme} ${scheme}: label ${lowest.label.toFixed(2)}, edge ${lowest.edge.toFixed(2)}` });
    });
  }
}

/** The text color of an element, as computed. */
const colorOf = (target: Locator) => target.evaluate((element) => getComputedStyle(element).color);

for (const scheme of ["light", "dark"] as const) {
  test(`should draw the accent tone in the theme's accent, and in the surface's text color on a primary surface, when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await useScheme(page, scheme);
    await galleryReady(page, "specs");
    const ocean = page.locator('[data-themed-surfaces="ocean"]');
    const surface = (name: string) => ocean.getByRole("group", { name: `Surface ${name}`, exact: true });
    const accentText = (name: string) => surface(name).getByText("accent text", { exact: true });
    const bodyText = (name: string) => surface(name).getByText(`Body text on the ${name} surface.`, { exact: true });
    // On the page the accent is the theme's own color, not its body text.
    await expect.poll(async () => (await colorOf(accentText("page"))) !== (await colorOf(bodyText("page")))).toBe(true);
    // A primary surface is the accent itself, so accent words there start from the surface's text color, not the accent.
    expect(await colorOf(accentText("primary"))).not.toBe(await colorOf(accentText("page")));
    for (const target of [accentText("primary"), bodyText("primary")]) {
      const reading = await readColors(target);
      expect(reading.contrast, `${reading.text} on ${reading.background}`).toBeGreaterThanOrEqual(4.5);
    }
    // The two are the same color to the eye: the accent there is the label color, re-lit by the tone rule at most a step.
    const [accent, body] = [await readColors(accentText("primary")), await readColors(bodyText("primary"))];
    expect(Math.abs(accent.contrast - body.contrast)).toBeLessThan(0.5);
    await expect(surface("primary").getByText("accent badge", { exact: true })).toBeVisible();
  });

  test(`should draw the site's accent tone as a blue of its own, not its body text, at 4.5:1 on every surface, when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await useScheme(page, scheme);
    await galleryReady(page, "specs");
    const boxes = await specimen(page, "specs", "Surfaces and tones").getByRole("group", { name: /^Surface / }).all();
    expect(boxes).toHaveLength(15);
    const pageBox = specimen(page, "specs", "Surfaces and tones").getByRole("group", { name: "Surface page", exact: true });
    expect(await colorOf(pageBox.getByText("accent text", { exact: true }))).not.toBe(await colorOf(pageBox.getByText("Body text on the page surface.", { exact: true })));
    let lowest = Infinity;
    for (const box of boxes) {
      const reading = await readColors(box.getByText("accent text", { exact: true }));
      expect(reading.contrast, `${(await box.getAttribute("aria-label")) ?? ""}: ${reading.text} on ${reading.background}`).toBeGreaterThanOrEqual(4.5);
      lowest = Math.min(lowest, reading.contrast);
    }
    test.info().annotations.push({ type: "lowest contrast", description: `site accent ${scheme}: ${lowest.toFixed(2)}` });
  });
}

for (const slug of ["button", "text", "icon", "badge"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    await expect(async () => { await expectNoAxeViolations(page, { skip: docsPreviewSkip }); }).toPass({ timeout: 20_000 });
  });
}

test("should turn Bold on and off with one button in the Button docs, and say so to screen readers", async ({ page }) => {
  await page.goto("/docs/json-render/components/button");
  const example = page.locator('[data-docs-example="A toggle that stays pressed"]');
  // Pressed only once React answers a press there: the interface's own root says so.
  await expect(example.locator("[data-docs-preview] > [data-example-ready]")).toBeAttached();
  const bold = example.getByRole("button", { name: "Bold" });
  await bold.scrollIntoViewIfNeeded();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(example.getByText("This line turns semibold while Bold is on.", { exact: true })).toHaveCSS("font-weight", "600");
  await expect(async () => { await expectNoAxeViolations(example); }).toPass({ timeout: 20_000 });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
});
