import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Focus inside a themed artifact: the gallery's "theme · focus ring"
 * specimen is a ui artifact in a custom theme whose card is too close to the
 * site's blue for the site's ring. The theme derives its own --ring, so a
 * focused switch's outline reads at 3:1 on the theme's card, on a light page
 * and on a dark one (the theme is locked to light).
 */

async function openSpecimen(page: Page, theme: "light" | "dark") {
  // Top frame only: the gallery's file stand-ins are data: frames, which have no storage.
  await page.addInitScript((value) => { if (window === window.top) window.localStorage.setItem("theme", value); }, theme);
  await page.goto("/dev/components#themes");
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
}

/** The painted outline color and the painted card behind the control, and their WCAG contrast. */
function readOutline(control: Locator): Promise<{ outline: number[]; card: number[]; contrast: number }> {
  return control.evaluate((element) => {
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
    let card = paint("white");
    for (const node of chain) card = paint(getComputedStyle(node).backgroundColor);
    const outline = paint(getComputedStyle(element).outlineColor);
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light = 0, dark = 0] = [luminance(outline), luminance(card)].sort((a, b) => b - a);
    return { outline, card, contrast: (light + 0.05) / (dark + 0.05) };
  });
}

/** The --ring an element sees, resolved to a color by the browser. */
function ringAt(element: Locator): Promise<string> {
  return element.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.outlineColor = "var(--ring)";
    node.append(probe);
    const color = getComputedStyle(probe).outlineColor;
    probe.remove();
    return color;
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`should draw a focus outline at 3:1 on a themed artifact's card when the page is ${theme}`, async ({ page }) => {
    await openSpecimen(page, theme);
    const specimen = page.locator("[data-focus-specimen]");
    const control = specimen.getByRole("switch");
    await control.focus();
    // Reach it from the keyboard, so :focus-visible applies.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-style", "solid");

    const reading = await readOutline(control);
    expect(reading.contrast, `outline ${reading.outline.join(",")} on card ${reading.card.join(",")}`).toBeGreaterThanOrEqual(3);
    // The theme set its own ring: it differs from the site ring the header sees.
    expect(await ringAt(specimen)).not.toBe(await ringAt(page.getByRole("heading", { name: "Component gallery" })));
  });
}
