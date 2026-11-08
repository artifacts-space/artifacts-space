import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { approveVersionWithCover, attachTestImage, cleanUp, createTestArtifact, devUserId, fileCurrentAsRecentEdit, fileRowExists, localDatabaseEnabled, localDatabaseSkipReason, storedCovers } from "./support/local-db";
import { largePhoto } from "./support/photos";

/**
 * Cover images over their life: a large phone photo is resized to a JPEG
 * under 2 MB in the browser before it uploads, Remove is undone by Restore
 * with the image intact, and readers outside the team cannot open a cover
 * image the approved version does not show. Needs dev sign-in and a local
 * throwaway database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
}

test("should resize a large phone photo to a JPEG under 2 MB before it uploads as a cover", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "One browser run is enough for the resize; the picker is the same on phones.");
  await signIn(page);
  const publicId = await createTestArtifact({ userId: await devUserId(), title: "Cover photo e2e", content: "# Trip", visibility: "private", theme: null, cover: "mist" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);

  const photo = await largePhoto(page);
  expect(photo.byteLength).toBeGreaterThan(2_097_152);
  await page.locator("[data-artifact-cover]").hover();
  await page.getByRole("button", { name: "Change cover" }).click();
  await expect(page.getByRole("button", { name: "Upload an image" })).toBeVisible();

  // The upload ticket is the first thing the browser asks the server for, with the prepared file's name, type, and size.
  const ticket = page.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes("contentType"));
  await page.locator('input[type="file"]').setInputFiles({ name: "IMG_4032.JPG", mimeType: "image/jpeg", buffer: photo });
  const sent = await ticket;
  // Let the server answer (locally it has no file storage, so the upload stops there) before the page closes.
  await sent.response();
  const body = JSON.parse(sent.postData() ?? "[]") as [{ filename: string; contentType: string; size: number }];
  expect(body[0]).toMatchObject({ filename: "IMG_4032.jpg", contentType: "image/jpeg" });
  expect(body[0].size).toBeGreaterThan(0);
  expect(body[0].size).toBeLessThanOrEqual(2_097_152);
});

test("should bring a removed image cover back with its file when an editor restores the older version, even right after adding it", async ({ page }, testInfo) => {
  await signIn(page);
  const userId = await devUserId();
  const fileId = randomUUID();
  const publicId = await createTestArtifact({ userId, title: `Cover restore ${testInfo.project.name}`, content: "# Notes", visibility: "private", theme: null, cover: `file:${fileId}@30` });
  created.push(publicId);
  await attachTestImage(publicId, userId, fileId);
  // The image cover was saved moments ago: a quick next save by the same editor would normally merge into that version.
  await fileCurrentAsRecentEdit(publicId);
  await page.goto(`/artifact/${publicId}`);

  const cover = page.locator("[data-artifact-cover]");
  await cover.hover();
  await cover.getByRole("button", { name: "Remove cover" }).click();
  await expect(cover).toHaveCount(0);
  await expect.poll(async () => (await storedCovers(publicId)).artifact).toBeNull();
  expect(await fileRowExists(fileId)).toBe(true);

  await page.getByRole("button", { name: "History" }).click();
  const list = page.getByRole("list", { name: "Versions" });
  await expect(list.getByRole("button")).toHaveCount(2);
  await list.getByRole("button").nth(1).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("dialog", { name: "Restore this version?" }).getByRole("button", { name: "Restore" }).click();

  await expect.poll(async () => (await storedCovers(publicId)).artifact).toBe(`file:${fileId}@30`);
  expect(await fileRowExists(fileId)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(cover).toBeVisible();
});

test("should refuse readers outside the team a cover image the approved version does not show", async ({ page, browser }) => {
  await signIn(page);
  const userId = await devUserId();
  const newer = randomUUID();
  const approved = randomUUID();
  const publicId = await createTestArtifact({ userId, title: "Cover access e2e", content: "# Shared", visibility: "public", theme: null, cover: `file:${newer}` });
  created.push(publicId);
  await attachTestImage(publicId, userId, newer);
  await attachTestImage(publicId, userId, approved);
  // Both files are attached before the approved version is saved, so only the image rule keeps the newer one private.
  await approveVersionWithCover(publicId, `file:${approved}`);

  const stranger = await browser.newContext();
  const hidden = await stranger.request.get(`/api/files/${newer}`, { maxRedirects: 0 });
  const shown = await stranger.request.get(`/api/files/${approved}`, { maxRedirects: 0 });
  await stranger.close();
  expect(hidden.status()).toBe(404);
  // Locally there is no file storage, so a readable file answers 500 instead of a redirect; never 404.
  expect(shown.status()).not.toBe(404);

  // The author reads the latest version and may open both.
  const own = await page.request.get(`/api/files/${newer}`, { maxRedirects: 0 });
  expect(own.status()).not.toBe(404);
});
