import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The shared Switch on the component gallery's "Switches" specimen, in the
 * Default look and in the Ocean theme, in light and dark: the on track is
 * green and reads at 3:1 on the card, each thumb reads at 3:1 on its track,
 * the thumb sits right when on and left when off, and it stops sliding when
 * the reader asks for reduced motion.
 */

/** Opens the switches specimen once the gallery's Mermaid diagrams have settled (they hold back hydration on busy runners). */
async function openSpecimen(page: Page, theme: "light" | "dark") {
  // Top frame only: the gallery's file stand-ins are data: frames, which have no storage.
  await page.addInitScript((value) => { if (window === window.top) window.localStorage.setItem("theme", value); }, theme);
  await page.goto("/dev/components#switches");
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
}

interface SwitchReading {
  /** The card behind the switch, the track, and the thumb, as painted. */
  card: number[];
  track: number[];
  thumb: number[];
  trackOnCard: number;
  thumbOnTrack: number;
}

/** Paints the card, the track over it, and the thumb over that on a 1 by 1 canvas, so oklch() and light-dark() resolve as drawn. */
function readSwitch(control: Locator): Promise<SwitchReading> {
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
    const track = paint(getComputedStyle(element).backgroundColor);
    const thumbElement = element.querySelector('[data-slot="switch-thumb"]');
    if (!thumbElement) throw new Error("no thumb");
    const thumb = paint(getComputedStyle(thumbElement).backgroundColor);
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
      const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    return { card, track, thumb, trackOnCard: ratio(track, card), thumbOnTrack: ratio(thumb, track) };
  });
}

/** The gap, in pixels, between the thumb and the track's left edge. */
async function thumbOffset(control: Locator): Promise<number> {
  const track = await control.boundingBox();
  const thumb = await control.locator('[data-slot="switch-thumb"]').boundingBox();
  if (!track || !thumb) throw new Error("switch not drawn");
  return Math.round(thumb.x - track.x);
}

for (const theme of ["light", "dark"] as const) {
  for (const scope of ["default", "ocean"] as const) {
    test(`should draw a green on track and readable thumbs at 3:1 when the ${scope} look is ${theme}`, async ({ page }, testInfo) => {
      // Reduced motion turns the color transitions off, so every reading is the final color.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openSpecimen(page, theme);
      const specimen = page.locator(`[data-switch-specimen="${scope}"]`);
      const on = specimen.getByRole("switch", { name: "On", exact: true });
      const off = specimen.getByRole("switch", { name: "Off", exact: true });
      await expect(on).toBeChecked();
      await expect(off).not.toBeChecked();

      const onReading = await readSwitch(on);
      const [red = 0, green = 0, blue = 0] = onReading.track;
      expect(green, `the on track is green: ${onReading.track.join(",")}`).toBeGreaterThan(Math.max(red, blue) + 40);
      expect(onReading.trackOnCard, "on track on the card").toBeGreaterThanOrEqual(3);
      expect(onReading.thumbOnTrack, "on thumb on its track").toBeGreaterThanOrEqual(3);

      // Hover tints the track; the thumb must still read at 3:1 on it. Phones have no hover.
      if (testInfo.project.name !== "phone") {
        await on.hover();
        await expect.poll(async () => (await readSwitch(on)).track.join(","), "the hovered track changes color").not.toBe(onReading.track.join(","));
        const hovered = await readSwitch(on);
        expect(hovered.thumbOnTrack, "on thumb on its hovered track").toBeGreaterThanOrEqual(3);
        expect(hovered.trackOnCard, "hovered on track on the card").toBeGreaterThanOrEqual(3);
        await page.mouse.move(0, 0);
      }

      const offReading = await readSwitch(off);
      expect(offReading.thumbOnTrack, "off thumb on its track").toBeGreaterThanOrEqual(3);
      expect(offReading.trackOnCard, "the off track stays quiet, near the card").toBeLessThan(1.5);
    });
  }
}

test("should size the switch as a 44 by 24 pill with an 18px thumb and move the thumb across when clicked", async ({ page }) => {
  await openSpecimen(page, "dark");
  const specimen = page.locator('[data-switch-specimen="default"]');
  const off = specimen.getByRole("switch", { name: "Off", exact: true });
  const box = await off.boundingBox();
  const thumb = await off.locator('[data-slot="switch-thumb"]').boundingBox();
  expect(box && { width: Math.round(box.width), height: Math.round(box.height) }).toEqual({ width: 44, height: 24 });
  expect(thumb && Math.round(thumb.width)).toBe(18);
  // A 3px inset on every side: flush left when off, 44 - 18 - 3 = 23px in when on.
  expect(await thumbOffset(off)).toBe(3);

  await off.click();
  await expect(off).toBeChecked();
  await expect.poll(() => thumbOffset(off)).toBe(23);
});

test("should size the small switch as a 32 by 18 pill with a 14px thumb and move the thumb across when clicked", async ({ page }) => {
  await openSpecimen(page, "light");
  const small = page.locator('[data-switch-specimen="default"]').getByRole("switch", { name: "Small, off" });
  const box = await small.boundingBox();
  const thumb = await small.locator('[data-slot="switch-thumb"]').boundingBox();
  expect(box && { width: Math.round(box.width), height: Math.round(box.height) }).toEqual({ width: 32, height: 18 });
  expect(thumb && Math.round(thumb.width)).toBe(14);
  // A 2px inset on every side: flush left when off, 32 - 14 - 2 = 16px in when on.
  expect(await thumbOffset(small)).toBe(2);

  await small.click();
  await expect(small).toBeChecked();
  await expect.poll(() => thumbOffset(small)).toBe(16);
});

test("should edge the off track with a hairline and leave the on track without one", async ({ page }) => {
  await openSpecimen(page, "dark");
  const specimen = page.locator('[data-switch-specimen="default"]');
  const shadow = (name: string) => specimen.getByRole("switch", { name, exact: true }).evaluate((element) => getComputedStyle(element).boxShadow);
  expect(await shadow("Off")).toMatch(/0px 0px 0px 1px inset/);
  expect(await shadow("On")).not.toMatch(/inset/);
});

test("should show a solid brand outline when the switch has keyboard focus", async ({ page }) => {
  await openSpecimen(page, "light");
  const on = page.locator('[data-switch-specimen="default"]').getByRole("switch", { name: "On", exact: true });
  await on.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(on).toBeFocused();
  await expect(on).toHaveCSS("outline-style", "solid");
  await expect(on).toHaveCSS("outline-width", "2px");
  const brand = await on.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.outlineColor = "var(--brand)";
    element.append(probe);
    const color = getComputedStyle(probe).outlineColor;
    probe.remove();
    return color;
  });
  // The outline color fades in with the track's color transition, so wait for it to settle.
  await expect.poll(() => on.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(brand);
});

test("should shrink the thumb while a switch is pressed and leave a disabled one alone", async ({ page }) => {
  await openSpecimen(page, "light");
  const specimen = page.locator('[data-switch-specimen="default"]');
  const thumbWidth = async (name: string) => {
    const box = await specimen.getByRole("switch", { name, exact: true }).locator('[data-slot="switch-thumb"]').boundingBox();
    return box ? Math.round(box.width * 10) / 10 : 0;
  };
  for (const [name, pressed] of [["Off", true], ["Off, disabled", false]] as const) {
    const box = await specimen.getByRole("switch", { name, exact: true }).boundingBox();
    if (!box) throw new Error("switch not drawn");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if (pressed) await expect.poll(() => thumbWidth(name), `${name} thumb while pressed`).toBeLessThan(17);
    else {
      // Wait out the 200ms scale transition, so a disabled thumb that did shrink would show it.
      await page.waitForTimeout(250);
      expect(await thumbWidth(name), `${name} thumb while pressed`).toBe(18);
    }
    await page.mouse.up();
  }
});

test("should not change a disabled switch when it is clicked", async ({ page }) => {
  await openSpecimen(page, "light");
  const disabled = page.locator('[data-switch-specimen="default"]').getByRole("switch", { name: "Off, disabled" });
  await expect(disabled).toBeDisabled();
  await disabled.click({ force: true });
  await expect(disabled).not.toBeChecked();
});

test("should stop the thumb sliding when the reader asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSpecimen(page, "light");
  const thumb = page.locator('[data-switch-specimen="default"]').getByRole("switch", { name: "On", exact: true }).locator('[data-slot="switch-thumb"]');
  await expect(thumb).toHaveCSS("transition-property", "none");
  // The thumb jumps: right after the click it is already 23px in, with no slide in between.
  const off = page.locator('[data-switch-specimen="default"]').getByRole("switch", { name: "Off", exact: true });
  await off.click();
  await expect(off).toBeChecked();
  expect(await thumbOffset(off)).toBe(23);
});
