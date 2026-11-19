import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

import { approveVersionWithCover, attachTestImage, cleanUp, createTestArtifact, devUserId, localDatabaseEnabled, localDatabaseSkipReason, storedCovers } from "./support/local-db";

/**
 * Covers on the artifact page: an editor adds, changes, and removes one (each
 * a saved version), the banner has a fixed height on phones and desktops, nothing moves
 * while the page and its cover load, and readers outside the team see the
 * approved version's cover. Needs dev sign-in and a local throwaway database
 * (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

/** Collects layout shifts that no input caused (what CLS counts) from the first paint on. */
async function watchLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { __cls: number };
    state.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) state.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
}

test("should add, change, and remove a cover as saved versions when an editor uses the page controls", async ({ page }, testInfo) => {
  await signIn(page);
  const publicId = await createTestArtifact({ userId: await devUserId(), title: `Cover e2e ${testInfo.project.name}`, content: "# Notes\n\nGive it a cover.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  const cover = page.locator("[data-artifact-cover]");
  await expect(cover).toHaveCount(0);
  await page.getByRole("heading", { level: 1, name: `Cover e2e ${testInfo.project.name}` }).hover();
  await page.getByRole("button", { name: "Add cover" }).click();

  await expect(cover.locator("[data-cover-gradient]")).toBeVisible();
  expect((await cover.boundingBox())?.height).toBe(testInfo.project.name === "phone" ? 160 : 240);
  await expect.poll(async () => (await storedCovers(publicId)).artifact).toMatch(/^[a-z]+$/);

  await cover.hover();
  await page.getByRole("button", { name: "Change cover" }).click();
  await page.getByRole("option", { name: "Dusk" }).click();
  await expect(cover.locator('[data-cover-gradient="dusk"]')).toBeVisible();
  await expect.poll(async () => (await storedCovers(publicId)).artifact).toBe("dusk");
  // Each save is filed as a version (quick saves by the same editor merge into the newest one).
  expect((await storedCovers(publicId)).versions[0]).toBe("dusk");

  await cover.hover();
  await cover.getByRole("button", { name: "Remove cover" }).click();
  await expect(cover).toHaveCount(0);
  await expect.poll(async () => (await storedCovers(publicId)).artifact).toBeNull();
  expect((await storedCovers(publicId)).versions[0]).toBeNull();
  await expect(page.getByRole("button", { name: "Add cover" })).toBeAttached();
});

test("should not shift the layout while a page with a gradient or image cover loads", async ({ page }, testInfo) => {
  await signIn(page);
  const userId = await devUserId();
  const gradient = await createTestArtifact({ userId, title: `Cover CLS gradient ${testInfo.project.name}`, content: "# Steady\n\nNothing moves.", visibility: "private", theme: "paper", cover: "tide" });
  // The file does not exist locally, so the image falls back to a quiet fill: the box must not change size either way.
  allowPageError("/api/files/0f8fad5b-d9cb-469f-a165-70867728950e", "The cover file does not exist, on purpose.");
  const image = await createTestArtifact({ userId, title: `Cover CLS image ${testInfo.project.name}`, content: "# Steady\n\nNothing moves.", visibility: "private", theme: null, cover: "file:0f8fad5b-d9cb-469f-a165-70867728950e@30" });
  created.push(gradient, image);
  await watchLayoutShifts(page);

  for (const publicId of [gradient, image]) {
    await page.goto(`/artifact/${publicId}`);
    await expect(page.locator("[data-artifact-cover]")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await layoutShift(page)).toBeLessThan(0.01);
    expect((await page.locator("[data-artifact-cover]").boundingBox())?.height).toBe(testInfo.project.name === "phone" ? 160 : 240);
  }
});

test("should show readers outside the team the approved cover, not a newer one", async ({ page, browser }, testInfo) => {
  await signIn(page);
  const publicId = await createTestArtifact({ userId: await devUserId(), title: `Cover approval ${testInfo.project.name}`, content: "# Shared\n\nApproved look.", visibility: "public", theme: null, cover: "dusk" });
  created.push(publicId);
  await approveVersionWithCover(publicId, "mist");

  // The author sees the latest cover.
  await page.goto(`/artifact/${publicId}`);
  await expect(page.locator('[data-cover-gradient="dusk"]')).toBeVisible();

  const stranger = await browser.newContext();
  const reader = await stranger.newPage();
  await reader.goto(`/artifact/${publicId}`);
  await expect(reader.locator('[data-cover-gradient="mist"]')).toBeVisible();
  await expect(reader.locator('[data-cover-gradient="dusk"]')).toHaveCount(0);
  await expect(reader.getByRole("button", { name: /cover/i })).toHaveCount(0);
  await stranger.close();
});

test("should move an image cover's focal point with the keyboard and save it when an editor repositions it", async ({ page }, testInfo) => {
  await signIn(page);
  const userId = await devUserId();
  const fileId = randomUUID();
  const publicId = await createTestArtifact({ userId, title: `Cover reposition ${testInfo.project.name}`, content: "# Notes", visibility: "private", theme: null, cover: `file:${fileId}@30` });
  created.push(publicId);
  await attachTestImage(publicId, userId, fileId);
  allowPageError(`/api/files/${fileId}`, "The seeded file has no stored object in the e2e environment, so the file route cannot serve it.");
  await page.goto(`/artifact/${publicId}`);

  const cover = page.locator("[data-artifact-cover]");
  await cover.hover();
  await page.getByRole("button", { name: "Reposition" }).click();
  const slider = page.getByRole("slider", { name: "Cover position" });
  await expect(slider).toBeFocused();
  await expect(slider).toHaveAttribute("aria-valuenow", "30");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(slider).toHaveAttribute("aria-valuenow", "42");
  await page.keyboard.press("Escape");
  await expect(slider).toHaveCount(0);
  expect((await storedCovers(publicId)).artifact).toBe(`file:${fileId}@30`);

  await cover.hover();
  await page.getByRole("button", { name: "Reposition" }).click();
  await expect(slider).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedCovers(publicId)).artifact).toBe(`file:${fileId}@1`);
});

/** The opacity of a computed CSS color: 1 when it names none. A form this does not know fails the test, never passes it. */
function alphaOf(color: string): number {
  const modern = /^[a-z0-9-]+\([^/]*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(color);
  const legacy = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/i.exec(color);
  const match = legacy ?? modern;
  if (!match) throw new Error(`Unreadable color: ${color}`);
  const alpha = match[1];
  if (alpha === undefined) return 1;
  return alpha.endsWith("%") ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
}

/** The surfaces drawn over the cover right now: every button in it, and the reposition hint when shown. */
async function surfacesOver(cover: Locator): Promise<{ name: string; color: string }[]> {
  return cover.locator("button, [role=slider] p").evaluateAll((nodes) => nodes.map((node) => ({ name: node.getAttribute("aria-label") ?? node.textContent.trim(), color: getComputedStyle(node).backgroundColor })));
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`should give everything drawn over the cover a solid surface in ${colorScheme} mode, so the words read over any image`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await signIn(page);
    const userId = await devUserId();
    const fileId = randomUUID();
    const publicId = await createTestArtifact({ userId, title: `Cover controls ${colorScheme} ${testInfo.project.name}`, content: "# Notes", visibility: "private", theme: null, cover: `file:${fileId}@30` });
    created.push(publicId);
    await attachTestImage(publicId, userId, fileId);
    allowPageError(`/api/files/${fileId}`, "The seeded file has no stored object in the e2e environment, so the file route cannot serve it.");

    await page.goto(`/artifact/${publicId}`);
    const cover = page.locator("[data-artifact-cover]");
    await cover.hover();
    const resting = await surfacesOver(cover);
    expect(resting.map((surface) => surface.name)).toEqual(expect.arrayContaining(["Remove cover"]));
    expect(resting.length, "Change cover, Reposition, and Remove").toBe(3);
    await page.getByRole("button", { name: "Reposition" }).click();
    await expect(page.getByRole("slider", { name: "Cover position" })).toBeFocused();
    const repositioning = await surfacesOver(cover);
    expect(repositioning.length, "the hint, Cancel, and Save position").toBe(3);
    for (const { name, color } of [...resting, ...repositioning]) expect(alphaOf(color), `${name}: ${color}`).toBe(1);
  });
}

for (const icon of ["🚀", null]) {
  test(`should take a removed cover away at once and leave the page ${icon ? "with an icon" : "without an icon"} as the server then draws it, while the save is still on its way`, async ({ page }, testInfo) => {
    await signIn(page);
    const title = `Cover removal ${icon ? "icon" : "plain"} ${testInfo.project.name}`;
    const publicId = await createTestArtifact({ userId: await devUserId(), title, content: "# Notes", visibility: "private", theme: null, cover: "dusk", icon });
    created.push(publicId);
    await page.goto(`/artifact/${publicId}`);
    const cover = page.locator("[data-artifact-cover]");
    const iconRow = page.locator("[data-page-icon]");
    const heading = page.getByRole("heading", { level: 1, name: title });
    await expect(cover).toBeVisible();

    // Hold the save (a server action posts to the page's own address) until the test lets it go.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/artifact/${publicId}`, async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await cover.hover();
    await cover.getByRole("button", { name: "Remove cover" }).click();

    await expect(cover).toHaveCount(0);
    await expect(page.locator("[data-cover-removed]")).toBeAttached();
    const header = await page.getByRole("banner").boundingBox();
    const waiting = { icon: await iconRow.boundingBox(), heading: await heading.boundingBox() };
    expect(waiting.icon && header && waiting.icon.y >= header.y + header.height, "the icon row is clear of the header while the save is on its way").toBe(true);

    release();
    await expect(page.getByRole("button", { name: "Add cover" })).toBeAttached();
    await expect(page.locator("[data-cover-removed]")).toHaveCount(0);
    await expect(iconRow).toHaveAttribute("data-page-icon", "in-flow");
    // The page does not move when the server's page takes over: the title, and so everything under it, keeps its place.
    const settled = { icon: await iconRow.boundingBox(), heading: await heading.boundingBox() };
    expect(settled.heading?.y).toBe(waiting.heading?.y);
    // The icon's box over a cover is not its row without one, so the row may settle by a few pixels, never more.
    expect(Math.abs((settled.icon?.y ?? 0) - (waiting.icon?.y ?? 0))).toBeLessThanOrEqual(8);
  });
}
