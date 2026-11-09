import { expect, test, type Locator, type Page } from "@playwright/test";

import { readColors, type ColorReading } from "./support/colors";

/**
 * The parts of the artifact page around the artifact (the header, the
 * comments, and the footer; the gallery's "artifact page chrome" specimen,
 * drawn by the same ArtifactPageTheme the page uses) take the artifact
 * theme's colors, swap when the theme changes, and stay readable.
 */

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

async function readAll(page: Page): Promise<Map<Part, ColorReading>> {
  const located = parts(page);
  const readings = new Map<Part, ColorReading>();
  for (const name of partNames) readings.set(name, await readColors(located[name]));
  return readings;
}

async function pickTheme(page: Page, next: string) {
  const specimen = page.locator('[data-specimen="artifact page chrome"]');
  const group = page.getByRole("radiogroup", { name: "Artifact theme" });
  // A click that lands while the picker is still opening can miss, so open and pick again until the page shows it.
  // A pick can also land after its check timed out: the button then names the new theme, so a retry finds it by its prefix.
  await expect(async () => {
    if (!(await group.isVisible())) await specimen.getByRole("button", { name: /^Page theme: / }).click({ timeout: 2_000 });
    await group.getByRole("radio", { name: new RegExp(`^${next}:`) }).click({ timeout: 2_000 });
    await expect(specimen.locator("[data-page-theme]")).toHaveAttribute("data-page-theme", next.toLowerCase(), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(specimen.getByRole("button", { name: `Page theme: ${next}`, exact: true }), "the picker names the theme in use").toBeVisible();
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

    await pickTheme(page, "Ocean");
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
    await pickTheme(page, "Default");
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

  // Tabbing to it from the logo opens the tooltip with the full sentence (hovering does too, with a mouse).
  // Retried, so a Tab pressed before the page has hydrated does not count.
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect(async () => {
    await header.getByRole("link", { name: "artifacts.space home" }).focus();
    await page.keyboard.press("Tab");
    await expect(badge).toBeFocused({ timeout: 1_000 });
    await expect(tooltip).toHaveText("Private. Only you can see this.", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  const icons = page.locator('[data-specimen="artifact page chrome"] [data-visibility-badges]');
  for (const [visibility, name] of [["private", "Private"], ["team", "Team"], ["link", "Link"], ["public", "Public"]] as const) {
    await expect(icons.locator(`[data-visibility="${visibility}"]`)).toContainText(name);
  }
});
