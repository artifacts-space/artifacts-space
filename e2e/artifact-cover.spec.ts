import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

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
  await page.getByRole("radio", { name: "Dusk" }).click();
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
