import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The parts of the artifact page around the artifact (the header, the
 * comments, and the footer; the gallery's "artifact page chrome" specimen,
 * drawn by the same ArtifactPageTheme the page uses) take the artifact
 * theme's colors, swap when the theme changes, and stay readable.
 */

interface Reading {
  /** The color behind the element, with every translucent layer above the page composited, as "r,g,b". */
  background: string;
  /** The element's text color, composited on that background, as "r,g,b". */
  text: string;
  /** The WCAG contrast ratio of the text on the background. */
  contrast: number;
}

/**
 * Reads what a reader sees: the browser draws each ancestor's background and
 * then the text color on a 1 by 1 canvas, so oklch(), light-dark(), and
 * translucent bars resolve exactly as painted.
 */
function read(locator: Locator): Promise<Reading> {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    const paint = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    let background = paint("white");
    for (const node of chain) background = paint(getComputedStyle(node).backgroundColor);
    const text = paint(getComputedStyle(element).color);
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(background), luminance(text)].sort((a, b) => b - a);
    return { background: background.join(","), text: text.join(","), contrast: ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05) };
  });
}

const partNames = ["header", "visibility", "comment", "commentMeta", "mention", "agentMention", "footer"] as const;
type Part = (typeof partNames)[number];
/** Mention chips: their background follows the theme; their ink keeps the site's hue unless it would not read. */
const chipParts: ReadonlySet<Part> = new Set(["mention", "agentMention"]);

function parts(page: Page): Record<Part, Locator> {
  const chrome = page.locator('[data-specimen="artifact page chrome"] [data-page-theme]');
  const comments = chrome.getByRole("region", { name: "Comments" });
  return {
    header: chrome.getByRole("link", { name: "artifacts.space home" }),
    visibility: chrome.getByRole("button", { name: "Private. Only you can see this." }),
    comment: comments.locator("article p").first(),
    commentMeta: comments.locator("article time"),
    mention: comments.getByText("@dana", { exact: true }),
    agentMention: comments.getByText("@claude-code", { exact: true }),
    footer: chrome.locator("footer").getByRole("link", { name: "artifacts.space" }),
  };
}

async function readAll(page: Page): Promise<Map<Part, Reading>> {
  const located = parts(page);
  const readings = new Map<Part, Reading>();
  for (const name of partNames) readings.set(name, await read(located[name]));
  return readings;
}

async function pickTheme(page: Page, current: string, next: string) {
  const specimen = page.locator('[data-specimen="artifact page chrome"]');
  await specimen.getByRole("button", { name: `Page theme: ${current}` }).click();
  await page.getByRole("radiogroup", { name: "Artifact theme" }).getByRole("radio", { name: new RegExp(`^${next}:`) }).click();
  await expect(specimen.locator("[data-page-theme]")).toHaveAttribute("data-page-theme", next.toLowerCase());
  // Links and buttons fade their colors; read them once every transition has finished.
  await page.evaluate(async () => {
    const transitions = document.getAnimations().filter((animation) => animation instanceof CSSTransition);
    await Promise.all(transitions.map((transition) => transition.finished.catch(() => undefined)));
  });
}

for (const mode of ["light", "dark"] as const) {
  test(`should swap the header, comments, and footer colors with the artifact theme and keep them readable when the site is ${mode}`, async ({ page }) => {
    // Top frame only: the gallery's file stand-ins are data: frames, which have no storage.
    await page.addInitScript((value) => { if (window === window.top) window.localStorage.setItem("theme", value); }, mode);
    await page.goto("/dev/components#themes");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${mode}\\b`));
    const chrome = page.locator('[data-specimen="artifact page chrome"] [data-page-theme]');
    await expect(chrome).toHaveAttribute("data-page-theme", "default");
    await expect(parts(page).mention).toBeVisible();
    const unthemed = await readAll(page);

    await pickTheme(page, "Default", "Ocean");
    const ocean = await readAll(page);
    for (const part of partNames) {
      const before = unthemed.get(part);
      const after = ocean.get(part);
      if (!before || !after) throw new Error(`no reading for ${part}`);
      expect(after.background, `${part} background changes`).not.toBe(before.background);
      // Mention chips keep the site's ink hue on the themed chip, re-lit only when it would not read.
      if (!chipParts.has(part)) expect(after.text, `${part} text changes`).not.toBe(before.text);
      expect(after.contrast, `${part} stays readable`).toBeGreaterThanOrEqual(4.5);
    }

    // Back to Default: the page looks exactly as it does with no theme.
    await pickTheme(page, "Ocean", "Default");
    expect(await readAll(page)).toEqual(unthemed);
  });
}

test("should show who can see the artifact in the header row without wrapping or overflowing", async ({ page }, testInfo) => {
  await page.goto("/dev/components#themes");
  const header = page.locator('[data-specimen="artifact page chrome"] header');
  const badge = header.getByRole("button", { name: "Private. Only you can see this." });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-visibility", "private");

  const label = badge.getByText("Private", { exact: true });
  if (testInfo.project.name === "phone") await expect(label).toHaveClass(/sr-only/);
  else await expect(label).toBeVisible();

  const fits = await header.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const children = [...element.querySelectorAll("a, button")].map((child) => child.getBoundingClientRect());
    return {
      overflow: element.scrollWidth - element.clientWidth,
      oneLine: children.every((box) => Math.abs(box.top + box.height / 2 - (row.top + row.height / 2)) < 2),
      inside: children.every((box) => box.left >= row.left - 0.5 && box.right <= row.right + 0.5),
    };
  });
  expect(fits.overflow, "the header row does not scroll sideways").toBeLessThanOrEqual(0);
  expect(fits.oneLine, "everything sits on one line").toBe(true);
  expect(fits.inside, "nothing spills out of the row").toBe(true);

  // Keyboard focus opens the tooltip with the full sentence (hover does too, with a mouse).
  await badge.focus();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText("Private. Only you can see this.");

  const icons = page.locator('[data-specimen="artifact page chrome"] [data-visibility-badges]');
  for (const [visibility, name] of [["private", "Private"], ["team", "Team"], ["link", "Link"], ["public", "Public"]] as const) {
    await expect(icons.locator(`[data-visibility="${visibility}"]`)).toContainText(name);
  }
});
