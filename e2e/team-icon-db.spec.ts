import { expect, request as playwrightRequest, test, type Locator, type Page, type Request } from "@playwright/test";

import { createTestTeam, deleteTestTeams, localDatabaseEnabled, readyDevUser, setTeamRole } from "./support/local-db";
import { closeTeamIconDb, localStorageEnabled, localStorageSkipReason, storedObjectExists, teamLogoOf } from "./support/team-icon-db";

/**
 * Team icons end to end, against a local throwaway database and a local
 * MinIO standing in for R2: an owner uploads a wide JPEG (cut to a square
 * in the browser), sees it in the team header, the team list, and the Teams
 * menu, replaces it (the old object is deleted), and removes it. Someone
 * whose role cannot change team settings gets no control, and the server
 * refuses the upload when it is sent anyway. People outside the team never
 * get the image. Skipped without local storage.
 */

test.skip(!localStorageEnabled(), localStorageSkipReason);
test.describe.configure({ mode: "serial" });

const seeded = { teamIds: [] as string[] };

test.afterAll(async () => {
  if (localDatabaseEnabled()) await deleteTestTeams(seeded.teamIds);
  await closeTeamIconDb();
});

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The seeded flow runs once, on the desktop viewport.");
});

/** A wide JPEG drawn in the browser, so the crop to a square is exercised. */
async function widePhoto(page: Page, hue: number): Promise<Buffer> {
  const base64 = await page.evaluate((shade) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 500;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    const gradient = context.createLinearGradient(0, 0, 900, 500);
    gradient.addColorStop(0, `hsl(${String(shade)} 70% 50%)`);
    gradient.addColorStop(1, `hsl(${String(shade + 60)} 70% 40%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 900, 500);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
  }, hue);
  return Buffer.from(base64, "base64");
}

/** Waits until an icon image has loaded through the members-only redirect and returns its natural size. */
async function loadedSize(image: Locator): Promise<{ width: number; height: number }> {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  return image.evaluate((element: HTMLImageElement) => ({ width: element.naturalWidth, height: element.naturalHeight }));
}

async function upload(page: Page, photo: Buffer, buttonName: string): Promise<Request> {
  await page.getByRole("button", { name: "Team icon", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Team icon" });
  await expect(dialog.getByRole("button", { name: buttonName })).toBeVisible();
  const sent = page.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"] !== undefined);
  await dialog.getByLabel("Team icon image").setInputFiles({ name: "team-photo.jpg", mimeType: "image/jpeg", buffer: photo });
  const request = await sent;
  // A saved icon closes the dialog.
  await expect(dialog).toHaveCount(0);
  return request;
}

const headerIcon = (page: Page) => page.getByRole("main").locator("[data-team-icon]").first();

test("should let an owner upload, see, replace, and remove the team icon, and refuse everyone else", async ({ page, baseURL }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const ownerId = await readyDevUser();
  const team = await createTestTeam(ownerId, "owner");
  seeded.teamIds.push(team.id);
  const outside = await createTestTeam(ownerId, "owner");
  seeded.teamIds.push(outside.id);

  await page.goto(`/teams/${team.slug}`);
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "monogram");

  // Upload: a 900 x 500 JPEG arrives as a 256 x 256 square.
  const uploadRequest = await upload(page, await widePhoto(page, 200), "Upload an image");
  await expect(page.getByText("Team icon added.")).toBeVisible();
  await expect.poll(() => teamLogoOf(team.id)).toMatch(new RegExp(`^team-icons/${team.id}/[0-9a-f-]{36}\\.(webp|png)$`));
  const firstKey = await teamLogoOf(team.id);
  if (!firstKey) throw new Error("No icon key was stored.");
  expect(await storedObjectExists(firstKey)).toBe(true);
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "image");
  expect(await loadedSize(headerIcon(page))).toEqual({ width: 256, height: 256 });

  // The team list and the Teams menu show it too.
  await page.goto("/teams");
  const listIcon = page.locator(`a[href="/teams/${team.slug}"] [data-team-icon]`);
  await expect(listIcon).toHaveAttribute("data-team-icon", "image");
  await loadedSize(listIcon);
  await page.getByRole("button", { name: "Teams" }).click();
  const menuIcon = page.getByRole("menuitem").filter({ has: page.locator('[data-team-icon="image"]') });
  await expect(menuIcon).toHaveCount(1);
  await loadedSize(menuIcon.locator("[data-team-icon]"));
  await page.keyboard.press("Escape");

  // Signed out, or outside the team: the same 404, never the image.
  const anonymous = await playwrightRequest.newContext({ baseURL: baseURL ?? "" });
  expect((await anonymous.get(`/api/teams/${team.id}/icon`, { maxRedirects: 0 })).status()).toBe(404);
  await anonymous.dispose();
  expect((await page.request.get(`/api/teams/${outside.id}/icon`, { maxRedirects: 0 })).status()).toBe(404);

  // Replace: the old object is deleted.
  await page.goto(`/teams/${team.slug}`);
  await upload(page, await widePhoto(page, 20), "Replace image");
  await expect(page.getByText("Team icon replaced.")).toBeVisible();
  await expect.poll(() => teamLogoOf(team.id)).not.toBe(firstKey);
  const secondKey = await teamLogoOf(team.id);
  if (!secondKey) throw new Error("No icon key was stored.");
  await expect.poll(() => storedObjectExists(firstKey)).toBe(false);
  expect(await storedObjectExists(secondKey)).toBe(true);

  // Remove: asks first, then the monogram is back and the object is gone.
  await page.getByRole("button", { name: "Team icon", exact: true }).click();
  await page.getByRole("dialog", { name: "Team icon" }).getByRole("button", { name: "Remove" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove the team icon?" });
  await expect(confirm.getByText("Don't ask again")).toBeVisible();
  await confirm.getByRole("button", { name: "Remove icon" }).click();
  await expect(page.getByText("Team icon removed.")).toBeVisible();
  await expect.poll(() => teamLogoOf(team.id)).toBeNull();
  await expect.poll(() => storedObjectExists(secondKey)).toBe(false);
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "monogram");

  // An admin cannot change team settings by default: no control, and the server refuses the same upload sent again.
  await setTeamRole(team.id, ownerId, "admin");
  await page.reload();
  await expect(page.getByRole("button", { name: "Leave team" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team icon", exact: true })).toHaveCount(0);
  const actionId = uploadRequest.headers()["next-action"] ?? "";
  const replay = await page.evaluate(async ({ id, teamId, url }) => {
    // The same call the dialog makes: (teamId, FormData) encoded as React sends server action arguments.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/png"); });
    if (!blob) throw new Error("No PNG");
    const form = new FormData();
    form.set("1_icon", new File([blob], "team-icon.png", { type: "image/png" }));
    form.set("0", JSON.stringify([teamId, "$K1"]));
    const response = await fetch(url, { method: "POST", headers: { "Next-Action": id, Accept: "text/x-component" }, body: form });
    return response.text();
  }, { id: actionId, teamId: team.id, url: `/teams/${team.slug}` });
  expect(replay).toContain("Only people who can change team settings can change the team icon.");
  expect(await teamLogoOf(team.id)).toBeNull();
});
