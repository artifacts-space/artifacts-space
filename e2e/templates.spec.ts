import type { Page } from "@playwright/test";

import { templateCategoriesInUse, templatesIn, uiTemplates } from "../src/lib/ui/templates/index";
import type { TemplateCategory, UiTemplate } from "../src/lib/ui/templates/types";

import { expectNoAxeViolations } from "./support/a11y";
import { unreachableSidewaysScrollers } from "./support/scrollers";
import { expect, test } from "./support/test";

/*
 * Every section template (src/lib/ui/templates), drawn by the real renderer
 * on the fixture page /dev/templates at the widths it is made for: 1440
 * pixels, 390 pixels, or both. The page draws one category at a time
 * (`?category=`), so it stays light however many templates there are. The
 * loops read the index, so a template added to a batch file is covered here
 * with no test of its own, and each failure names the template.
 */

/** The categories that have templates. Every template has one category, so the loops below reach every template. */
const categories = templateCategoriesInUse();

const widthsOf = (template: UiTemplate) => (template.viewport === "fluid" ? [1440, 390] : template.viewport === "wide" ? [1440] : [390]);

/*
 * The page streams its content, and a stored theme can update the page
 * before that content hydrates; React then draws the content itself and
 * leaves the streamed copy in the document, hidden. So every locator starts
 * from what a reader can see.
 */
const section = (page: Page, id: string) => page.locator(`[data-template="${id}"]:visible`);

/**
 * Waits until every box that scrolls sideways has measured itself and become
 * a tab stop. That happens in the browser, after React takes the page over,
 * so a scan that runs sooner fails on a slow machine and passes on a fast one.
 */
async function expectScrollersMeasured(page: Page) {
  await expect.poll(() => unreachableSidewaysScrollers(page), { timeout: 30_000 }).toEqual([]);
}

/** Opens one category's page and waits until React has taken over every template: a scan marks what it scans, which must not land on HTML React has yet to check. */
async function open(page: Page, category: TemplateCategory) {
  await page.goto(`/dev/templates?category=${category}`);
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await expectScrollersMeasured(page);
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

test("should reach every template in the index through the category pages, and list those categories when no category is asked for", async ({ page }) => {
  expect(categories.flatMap((category) => templatesIn(category)).map((template) => template.id).sort()).toEqual(uiTemplates.map((template) => template.id).sort());
  await page.goto("/dev/templates");
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await expect(page.locator("[data-template-categories] a:visible")).toHaveText(categories.map((category) => new RegExp(`^${category}\\s*${String(templatesIn(category).length)}$`)));
  await expect(page.locator("[data-template]")).toHaveCount(0);
});

/** Each frame is exactly as wide as it says, holds its content, and draws something. */
async function expectInsideFrames(page: Page, template: UiTemplate) {
  for (const width of widthsOf(template)) {
    const frame = section(page, template.id).locator(`[data-template-frame="${String(width)}"]`);
    const box = await frame.evaluate((element: HTMLElement) => ({ offset: element.offsetWidth, client: element.clientWidth, scroll: element.scrollWidth, height: element.offsetHeight }));
    expect(box.offset, `the ${String(width)} frame's own width`).toBe(width);
    expect(box.scroll, `content wider than the ${String(width)} frame`).toBeLessThanOrEqual(box.client);
    expect(box.height, `the ${String(width)} frame draws something`).toBeGreaterThan(20);
  }
}

for (const category of categories) {
  const templates = templatesIn(category);

  test(`should draw every ${category} template at the widths it is made for, inside its frames, and pass axe`, async ({ page }) => {
    await open(page, category);
    await expect(page.locator("[data-template]:visible")).toHaveCount(templates.length);
    await forEachTemplate(templates, async (template) => {
      await expect(section(page, template.id).locator("[data-template-frame]")).toHaveCount(widthsOf(template).length);
      // A spec that cannot be drawn, or a part of one, shows a notice in its place.
      await expect(section(page, template.id).getByText(/could not be shown/)).toHaveCount(0);
      await expectInsideFrames(page, template);
      await section(page, template.id).scrollIntoViewIfNeeded();
      await expectNoAxeViolations(section(page, template.id));
    });
  });

  for (const scheme of ["light", "dark"] as const) {
    test.describe(`in ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      test(`should pass color contrast on every ${category} template when the site is ${scheme}`, async ({ page, isMobile }) => {
        // Colors do not change with the viewport: once, on the desktop.
        test.skip(isMobile, "the same colors as the desktop run");
        await page.addInitScript((value) => {
          try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
        }, scheme);
        await open(page, category);
        await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*(^|\s)dark(\s|$))/);
        await forEachTemplate(templates, async (template) => {
          await section(page, template.id).scrollIntoViewIfNeeded();
          await expectNoAxeViolations(section(page, template.id), { only: ["color-contrast"] });
        });
      });
    });
  }
}

/*
 * The mechanism itself, on the first templates: a template drawn under its
 * prefix still reads and writes its own state, lays itself out by its
 * frame's width, and the frame check can tell when content is too wide.
 */
const frameOf = (page: Page, id: string, width: 1440 | 390) => section(page, id).locator(`[data-template-frame="${String(width)}"]`);

test("should change every plan's price in one frame only when a reader flips the billing switch of a prefixed template", async ({ page }) => {
  await open(page, "pricing");
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
  await open(page, "pricing");
  const columns = (width: 1440 | 390) => frameOf(page, "pricing-three-tiers", width).locator("[data-slot=ui-grid]").first().evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns;
    return tracks === "none" ? 0 : tracks.split(" ").length;
  });
  expect(await columns(1440)).toBe(3);
  expect(await columns(390)).toBe(1);
  await open(page, "navbar");
  const wideBar = frameOf(page, "navbar-basic", 1440).getByRole("group", { name: "Site navigation" });
  const narrowBar = frameOf(page, "navbar-basic", 390).getByRole("group", { name: "Site navigation" });
  await wideBar.scrollIntoViewIfNeeded();
  await expect(wideBar.getByText("Pricing", { exact: true })).toBeVisible();
  await expect(wideBar.getByRole("button", { name: "Open menu" })).toBeHidden();
  await expect(narrowBar.getByText("Pricing", { exact: true })).toBeHidden();
  await expect(narrowBar.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("should measure content wider than its frame, so the frame check can fail", async ({ page }) => {
  await open(page, "hero");
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

/** The docs index: a row for every template, each linked to its category's page, nothing drawn, and a clean scan. */
async function expectDocsIndex(page: Page) {
  await page.goto("/docs/json-render/templates");
  await expect(page.getByRole("heading", { level: 1, name: "Section templates" })).toBeVisible();
  await expect(page.locator("[data-docs-template-row]")).toHaveCount(uiTemplates.length);
  await forEachTemplate(uiTemplates, async (template) => {
    const row = page.locator(`[data-docs-template-row="${template.id}"]`);
    await expect(row).toHaveText(template.name);
    await expect(row).toHaveAttribute("href", `/docs/json-render/templates/${template.category}#${template.id}`);
  });
  // The index carries rows, not specs: nothing is drawn here.
  await expect(page.locator("[data-docs-preview]")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // Its code blocks and its table become tab stops once they have measured themselves in the browser.
  await expectScrollersMeasured(page);
  await expectNoAxeViolations(page);
}

/** One category's docs page: each of its templates drawn live under a heading that carries its id, and a clean scan. */
async function expectDocsCategory(page: Page, category: TemplateCategory) {
  const templates = templatesIn(category);
  await page.goto(`/docs/json-render/templates/${category}`);
  // Each preview says when React has taken it over; what the browser adds is there from then on.
  await expect(page.locator("[data-docs-template][data-ready]")).toHaveCount(templates.length, { timeout: 60_000 });
  for (const template of templates) {
    const example = page.locator(`[data-docs-template="${template.id}"]`);
    // The heading carries the template's id, so the index's link lands on it.
    await expect(page.locator(`h2[id="${template.id}"]`)).toContainText(template.name);
    await expect(example.getByText(/could not be shown/)).toHaveCount(0);
    expect((await example.locator("[data-docs-preview]").boundingBox())?.height ?? 0, template.id).toBeGreaterThan(40);
  }
  await page.evaluate(() => document.fonts.ready);
  await expectScrollersMeasured(page);
  await expectNoAxeViolations(page);
}

test("should list every template on the docs index, each linked to its category's page, without drawing any, and pass axe", async ({ page }) => {
  await expectDocsIndex(page);
});

test("should draw each category's templates live on that category's docs page, and pass axe", async ({ page }) => {
  // One page per category; the time allowed grows with them.
  test.setTimeout(60_000 + categories.length * 20_000);
  const failures: string[] = [];
  for (const category of categories) {
    try {
      await expectDocsCategory(page, category);
    } catch (error) {
      failures.push(`${category}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
});

test("should pass the same docs checks when the machine is slow, so no scan depends on how soon React takes the page over", async ({ page, isMobile }) => {
  // Seen on CI only: a scan that ran before the page was taken over found a code block with no tab stop and a switch with no name.
  test.skip(isMobile, "the timing is the same on a phone; once is enough");
  test.setTimeout(240_000);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 8 });
  await expectDocsIndex(page);
  await expectDocsCategory(page, "pricing");
});

test("should name the billing switch in the HTML the server sends, before the browser runs", async ({ request }) => {
  const html = await (await request.get("/docs/json-render/templates/pricing")).text();
  const control = /<[a-z]+\b[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? "";
  const labelId = /aria-labelledby="([^"]+)"/.exec(control)?.[1] ?? "missing";
  expect(control, "the switch in the server's HTML").not.toBe("");
  expect(html).toContain(`id="${labelId}"`);
  expect(html.slice(html.indexOf(`id="${labelId}"`), html.indexOf(`id="${labelId}"`) + 400)).toContain("Bill yearly and save two months");
});

test("should copy a template's spec, indented, from its docs page, though the page carries it compact", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are a Chromium feature");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/json-render/templates/hero");
  // The button copies only once React has taken the preview over.
  const example = page.locator('[data-docs-template="hero-centered"][data-ready]');
  await example.getByRole("button", { name: "Copy JSON" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('\n  "root": "page"');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect((JSON.parse(copied) as { elements: Record<string, unknown> }).elements).toHaveProperty("hero-centered-title");
});
