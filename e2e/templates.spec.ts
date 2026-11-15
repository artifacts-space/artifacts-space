import type { Page } from "@playwright/test";

import { templatesByFile, uiTemplates } from "../src/lib/ui/templates/index";
import { templateFiles, type UiTemplate } from "../src/lib/ui/templates/types";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * Every section template (src/lib/ui/templates), drawn by the real renderer
 * on the fixture page /dev/templates at the widths it is made for: 1440
 * pixels, 390 pixels, or both. The loops read the index, so a template added
 * to a batch file is covered here with no test of its own, and each failure
 * names the template.
 */

const widthsOf = (template: UiTemplate) => (template.viewport === "fluid" ? [1440, 390] : template.viewport === "wide" ? [1440] : [390]);

/*
 * The page streams its content, and a stored theme can update the page
 * before that content hydrates; React then draws the content itself and
 * leaves the streamed copy in the document, hidden. So every locator starts
 * from what a reader can see.
 */
const section = (page: Page, id: string) => page.locator(`[data-template="${id}"]:visible`);

/** Opens the page and waits until React has taken over every template: a scan marks what it scans, which must not land on HTML React has yet to check. */
async function open(page: Page) {
  await page.goto("/dev/templates");
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Runs `check` for each template and fails once, naming every template that failed. */
async function forEachTemplate(templates: readonly UiTemplate[], check: (template: UiTemplate) => Promise<void>) {
  const failures: string[] = [];
  for (const template of templates) {
    try {
      await check(template);
    } catch (error) {
      failures.push(`${template.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
}

test("should draw every template in the index, each at the widths it is made for, with nothing left out", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-template]:visible")).toHaveCount(uiTemplates.length);
  await forEachTemplate(uiTemplates, async (template) => {
    await expect(section(page, template.id).locator("[data-template-frame]")).toHaveCount(widthsOf(template).length);
    // A spec that cannot be drawn, or a part of one, shows a notice in its place.
    await expect(section(page, template.id).getByText(/could not be shown/)).toHaveCount(0);
  });
});

test("should keep every template inside its frame, at 1440 and at 390 pixels wide", async ({ page }) => {
  await open(page);
  await forEachTemplate(uiTemplates, async (template) => {
    for (const width of widthsOf(template)) {
      const frame = section(page, template.id).locator(`[data-template-frame="${String(width)}"]`);
      const box = await frame.evaluate((element: HTMLElement) => ({ offset: element.offsetWidth, client: element.clientWidth, scroll: element.scrollWidth, height: element.offsetHeight }));
      expect(box.offset, `the ${String(width)} frame's own width`).toBe(width);
      expect(box.scroll, `content wider than the ${String(width)} frame`).toBeLessThanOrEqual(box.client);
      expect(box.height, `the ${String(width)} frame draws something`).toBeGreaterThan(20);
    }
  });
});

for (const file of templateFiles) {
  const templates = templatesByFile[file];

  test(`should pass axe on every template in ${file}.ts`, async ({ page }) => {
    test.skip(templates.length === 0, "this batch has no templates yet");
    await open(page);
    await forEachTemplate(templates, async (template) => {
      await section(page, template.id).scrollIntoViewIfNeeded();
      await expectNoAxeViolations(section(page, template.id));
    });
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`should pass color contrast on every template when the site is ${scheme}`, async ({ page, isMobile }) => {
      // Colors do not change with the viewport: once, on the desktop.
      test.skip(isMobile, "the same colors as the desktop run");
      await page.addInitScript((value) => {
        try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
      }, scheme);
      await open(page);
      await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*(^|\s)dark(\s|$))/);
      await forEachTemplate(uiTemplates, async (template) => {
        await section(page, template.id).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(section(page, template.id), { only: ["color-contrast"] });
      });
    });
  });
}

/*
 * The mechanism itself, on the first templates: a template drawn under its
 * prefix still reads and writes its own state, lays itself out by its
 * frame's width, and the frame check can tell when content is too wide.
 */
const frameOf = (page: Page, id: string, width: 1440 | 390) => section(page, id).locator(`[data-template-frame="${String(width)}"]`);

test("should change every plan's price in one frame only when a reader flips the billing switch of a prefixed template", async ({ page }) => {
  await open(page);
  const wide = frameOf(page, "pricing-three-tiers", 1440);
  const narrow = frameOf(page, "pricing-three-tiers", 390);
  await wide.scrollIntoViewIfNeeded();
  await expect(wide.getByRole("heading", { level: 3 })).toHaveText(["Starter", "Team", "Company"]);
  await expect(wide.getByText("$12", { exact: true })).toBeVisible();
  await expect(wide.getByText("Most popular")).toHaveCount(1);
  // A prop read from the repeat's item can be a named step too: the popular plan's surface differs from the others'.
  const fills = await wide.locator("[data-slot=ui-grid] > *").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backgroundColor));
  expect(fills).toHaveLength(3);
  expect(fills[0]).toBe(fills[2]);
  expect(fills[1]).not.toBe(fills[0]);
  await expect(wide.getByRole("button", { name: "Choose Team" })).toBeVisible();
  await expect(wide.getByText("Paid plans start with a 14-day trial. No card needed.")).toBeVisible();
  await wide.getByRole("switch", { name: "Bill yearly and save two months" }).click();
  await expect(wide.getByText("$10", { exact: true })).toBeVisible();
  await expect(wide.getByText("$12", { exact: true })).toHaveCount(0);
  await expect(wide.getByText("per person each month, billed yearly")).toHaveCount(3);
  // Each frame is its own interface: the other one still shows monthly prices.
  await expect(narrow.getByText("$12", { exact: true })).toBeVisible();
});

test("should lay a template out by its frame's width, not the window's", async ({ page }) => {
  await open(page);
  const columns = (width: 1440 | 390) => frameOf(page, "pricing-three-tiers", width).locator("[data-slot=ui-grid]").first().evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns;
    return tracks === "none" ? 0 : tracks.split(" ").length;
  });
  expect(await columns(1440)).toBe(3);
  expect(await columns(390)).toBe(1);
  const wideBar = frameOf(page, "navbar-basic", 1440).getByRole("group", { name: "Site navigation" });
  const narrowBar = frameOf(page, "navbar-basic", 390).getByRole("group", { name: "Site navigation" });
  await wideBar.scrollIntoViewIfNeeded();
  await expect(wideBar.getByText("Pricing", { exact: true })).toBeVisible();
  await expect(wideBar.getByRole("button", { name: "Open menu" })).toBeHidden();
  await expect(narrowBar.getByText("Pricing", { exact: true })).toBeHidden();
  await expect(narrowBar.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("should measure content wider than its frame, so the frame check can fail", async ({ page }) => {
  await open(page);
  const frame = frameOf(page, "hero-centered", 390);
  const fits = await frame.evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth);
  const overflows = await frame.evaluate((element: HTMLElement) => {
    const wide = document.createElement("div");
    wide.style.width = "600px";
    wide.style.height = "1px";
    element.append(wide);
    const result = element.scrollWidth > element.clientWidth;
    wide.remove();
    return result;
  });
  expect(fits).toBe(true);
  expect(overflows).toBe(true);
});

test("should list every template on the docs page, each drawn live, and pass axe", async ({ page }) => {
  await page.goto("/docs/json-render/templates");
  await expect(page.getByRole("heading", { level: 1, name: "Section templates" })).toBeVisible();
  await expect(page.locator("[data-docs-template]")).toHaveCount(uiTemplates.length);
  await forEachTemplate(uiTemplates, async (template) => {
    const example = page.locator(`[data-docs-template="${template.id}"]`);
    await expect(example.getByText(template.name, { exact: true })).toBeVisible();
    await expect(example.getByText(/could not be shown/)).toHaveCount(0);
    expect((await example.locator("[data-docs-preview]").boundingBox())?.height ?? 0).toBeGreaterThan(40);
  });
  await page.evaluate(() => document.fonts.ready);
  await expectNoAxeViolations(page);
});
