import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, setTestFullWidth } from "./support/local-db";

/**
 * The artifact's own page, as its editor and as a reader: the page header
 * holds the editing controls (save status and a "⋯" with Full width,
 * History, and View source) for editors only, there is no row of controls
 * or "Private · markdown" line above the title, and a cover runs down to
 * the middle of the page icon. Needs dev sign-in and a local throwaway
 * database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

const header = (page: Page) => page.getByRole("banner");
const moreActions = (page: Page) => header(page).getByRole("button", { name: "More actions" });

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
}

/** Seeds an artifact for the signed-in dev user. */
async function seed(title: string, options: { visibility?: "private" | "public"; cover?: string | null; icon?: string | null; theme?: string | null } = {}) {
  const publicId = await createTestArtifact({
    userId: await readyDevUser(),
    title,
    content: "# Notes\n\nA short note.",
    visibility: options.visibility ?? "private",
    theme: options.theme ?? null,
    cover: options.cover ?? null,
    icon: options.icon ?? null,
  });
  created.push(publicId);
  return publicId;
}

/** Opens the page as someone signed out, in a fresh browser context. */
async function asReader(browser: Browser, publicId: string, colorScheme: "light" | "dark" = "light") {
  const context = await browser.newContext({ colorScheme });
  const page = await context.newPage();
  await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, colorScheme);
  await page.goto(`/artifact/${publicId}`);
  return { page, close: () => context.close() };
}

/** How far the cover's bottom edge is from the icon's vertical centre, in CSS pixels. */
async function coverToIconCentre(page: Page, icon: Locator) {
  const cover = await page.locator("[data-artifact-cover]").boundingBox();
  const box = await icon.boundingBox();
  if (!cover || !box) throw new Error("No cover or icon on the page.");
  return Math.abs(cover.y + cover.height - (box.y + box.height / 2));
}

/** The space between the bottom of `above` and the top of `below`, in CSS pixels. */
async function verticalGap(above: Locator, below: Locator) {
  const [top, bottom] = await Promise.all([above.boundingBox(), below.boundingBox()]);
  if (!top || !bottom) throw new Error("Both elements must be on the page.");
  return bottom.y - (top.y + top.height);
}

/** Sideways overflow of the page and the header row, and whether the header's controls share one line. */
function headerFit(page: Page) {
  return header(page).evaluate((element) => {
    const row = element.getBoundingClientRect();
    const children = [...element.querySelectorAll("a, button, [data-slot=save-indicator]")].map((child) => child.getBoundingClientRect());
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      row: element.scrollWidth - element.clientWidth,
      oneLine: children.every((box) => Math.abs(box.top + box.height / 2 - (row.top + row.height / 2)) < 2),
    };
  });
}

test("should give editors a header ⋯ with Full width, History, and View source, and no controls row or meta line above the title", async ({ page }, testInfo) => {
  await signIn(page);
  const title = `Header menu ${testInfo.project.name}`;
  const publicId = await seed(title);
  await page.goto(`/artifact/${publicId}`);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);

  await expect(page.locator("main").getByText(/·\s*markdown/)).toHaveCount(0);
  await expect(page.locator("main").getByRole("switch", { name: "Full width" })).toHaveCount(0);
  await expect(page.locator("main").getByRole("button", { name: "History" })).toHaveCount(0);
  await expect(header(page).locator("[data-slot=save-indicator]")).toBeAttached();

  await moreActions(page).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Full width" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "History" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "View source" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact source" })).toBeVisible();
  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "Hide source" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact source" })).toHaveCount(0);

  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: `History of ${title}` })).toBeVisible();
  await page.keyboard.press("Escape");

  const fit = await headerFit(page);
  expect(fit.page, "no sideways page scroll").toBeLessThanOrEqual(0);
  expect(fit.row, "the header row does not scroll sideways").toBeLessThanOrEqual(0);
  expect(fit.oneLine, "the header stays on one line").toBe(true);
});

test("should show readers no ⋯ and no meta line when they cannot edit", async ({ page, browser }, testInfo) => {
  await signIn(page);
  const publicId = await seed(`Header reader ${testInfo.project.name}`, { visibility: "public" });
  const reader = await asReader(browser, publicId);
  await expect(reader.page.getByRole("heading", { level: 1, name: `Header reader ${testInfo.project.name}` })).toBeVisible();
  await expect(header(reader.page).getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(header(reader.page).getByRole("button", { name: "More actions" })).toHaveCount(0);
  await expect(header(reader.page).locator("[data-slot=save-indicator]")).toHaveCount(0);
  await expect(reader.page.locator("main").getByText(/·\s*markdown|Shared artifact/)).toHaveCount(0);
  await reader.close();
});

test("should widen the page from Full width in the header's ⋯ and keep it after a reload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "measured on a wide window");
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page);
  const title = `Header width ${testInfo.project.name}`;
  const publicId = await seed(title);
  await page.goto(`/artifact/${publicId}`);
  const main = page.locator("main");
  await expect(main).toHaveAttribute("data-full-width", "false");

  await moreActions(page).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Full width" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(main).toHaveAttribute("data-full-width", "true");
  await expect(page.getByRole("textbox", { name: "Title" }), "the page stays editable").toHaveValue(title);
  expect(await main.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(960);

  await page.reload();
  await expect(main).toHaveAttribute("data-full-width", "true");
  await moreActions(page).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Full width" })).toHaveAttribute("aria-checked", "true");
});

test("should run the cover down to the middle of the page icon for editors and readers, at either width", async ({ page, browser }, testInfo) => {
  await signIn(page);
  const publicId = await seed(`Cover icon ${testInfo.project.name}`, { visibility: "public", cover: "dusk", icon: "🚀" });

  for (const fullWidth of [false, true]) {
    await setTestFullWidth(publicId, fullWidth);
    await page.goto(`/artifact/${publicId}`);
    const icon = page.getByRole("button", { name: "Change icon" });
    await expect(icon).toBeVisible();
    expect(await coverToIconCentre(page, icon), `editor, full width ${String(fullWidth)}`).toBeLessThanOrEqual(3);
    // The cover's own controls stay clickable beside the icon.
    await page.locator("[data-artifact-cover]").hover();
    await expect(page.getByRole("button", { name: "Change cover" })).toBeVisible();
    const fit = await headerFit(page);
    expect(fit.page, "no sideways page scroll").toBeLessThanOrEqual(0);
  }

  for (const colorScheme of ["light", "dark"] as const) {
    const reader = await asReader(browser, publicId, colorScheme);
    const icon = reader.page.locator("[data-page-icon=over-cover] > div");
    await expect(icon).toBeVisible();
    expect(await coverToIconCentre(reader.page, icon), `reader, ${colorScheme}`).toBeLessThanOrEqual(3);
    await reader.close();
  }
});

test("should keep the title clear of a cover without an icon, and the icon in place without a cover", async ({ page }, testInfo) => {
  await signIn(page);
  const coverOnly = await seed(`Cover only ${testInfo.project.name}`, { cover: "tide", theme: "ocean" });
  const iconOnly = await seed(`Icon only ${testInfo.project.name}`, { icon: "🚀" });

  await page.goto(`/artifact/${coverOnly}`);
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toBeVisible();
  expect(await verticalGap(page.locator("[data-artifact-cover]"), title), "space between the cover and the title").toBeGreaterThanOrEqual(24);

  await page.goto(`/artifact/${iconOnly}`);
  const icon = page.getByRole("button", { name: "Change icon" });
  await expect(icon).toBeVisible();
  await expect(page.locator("[data-page-icon=in-flow]")).toBeVisible();
  expect(await verticalGap(header(page), icon), "the icon sits below the header").toBeGreaterThanOrEqual(24);
});

test("should give the header ⋯ menu the artifact theme's colors", async ({ page }, testInfo) => {
  await signIn(page);
  const publicId = await seed(`Header theme ${testInfo.project.name}`, { theme: "ocean" });
  await page.goto(`/artifact/${publicId}`);
  await moreActions(page).click();
  const popup = page.locator("[data-slot=dropdown-menu-content]");
  await expect(popup).toBeVisible();
  const colors = await popup.evaluate((element) => {
    const themed = document.querySelector("header")?.closest("[style]");
    const read = (node: Element | null, name: string) => (node ? getComputedStyle(node).getPropertyValue(name).trim() : "");
    return { popup: read(element, "--popover"), page: read(themed ?? null, "--popover"), site: read(document.documentElement, "--popover") };
  });
  expect(colors.popup).toBe(colors.page);
  expect(colors.page, "the artifact theme changes the menu color").not.toBe(colors.site);
});
