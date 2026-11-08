import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { themePresets } from "../src/lib/themes/presets";

import {
  cleanUp,
  createTestArtifact,
  createTestTeam,
  deleteTestTeams,
  devUserId,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  readyDevUser,
  setTeamRole,
  shareTestArtifact,
  teamPresetRefs,
  teamPresetTheme,
} from "./support/local-db";
import { largePhoto } from "./support/photos";

/**
 * Theme polish, end to end, on a phone and a desktop: a team admin exports a
 * preset as JSON and imports it back unchanged, a faint import is fixed with
 * Apply suggestions, and an artifact's custom theme (as an agent would set
 * it) shows as Custom in the picker, copies as JSON, and saves as a team
 * preset for owners and admins only. A phone photo picked as an icon is
 * resized in the browser before it uploads. Needs dev sign-in and a local
 * throwaway database; skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const seeded = { publicIds: [] as string[], teamIds: [] as string[] };

test.afterAll(async () => {
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, []);
});

async function signIn(page: Page): Promise<string> {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

async function newTeam(userId: string) {
  const team = await createTestTeam(userId, "owner");
  seeded.teamIds.push(team.id);
  return team;
}

async function downloadJson(page: Page, dialog: ReturnType<Page["getByRole"]>): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download JSON" }).click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: await readFile(path, "utf8") };
}

function oceanTheme() {
  const preset = themePresets.find((item) => item.id === "ocean");
  if (!preset) throw new Error("The ocean preset is missing.");
  return preset.theme;
}

test("should round-trip a preset through Download JSON and Import JSON, and fix a faint import with one click", async ({ page }, testInfo) => {
  const userId = await signIn(page);
  const team = await newTeam(userId);
  const project = testInfo.project.name;

  await page.goto(`/teams/${team.slug}`);
  await page.getByRole("button", { name: "New preset" }).click();
  let dialog = page.getByRole("dialog", { name: "New team preset" });
  await dialog.getByLabel("Name").fill(`Exported ${project}`);
  await dialog.getByRole("combobox", { name: "Start from" }).click();
  await page.getByRole("option", { name: "Ocean", exact: true }).click();
  const exported = await downloadJson(page, dialog);
  expect(exported.name).toBe(`exported-${project}.theme.json`);
  expect(JSON.parse(exported.text)).toMatchObject({ version: 1, light: expect.any(Object), dark: expect.any(Object) });
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "New preset" }).click();
  dialog = page.getByRole("dialog", { name: "New team preset" });
  const name = `Imported ${project}`;
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Import JSON" }).click();
  await dialog.getByLabel("Theme file").setInputFiles({ name: "ocean.theme.json", mimeType: "application/json", buffer: Buffer.from(exported.text) });
  await expect(dialog.getByRole("status").filter({ hasText: "Theme imported. Check the preview, then save." })).toBeVisible();
  expect((await downloadJson(page, dialog)).text).toBe(exported.text);

  // Broken JSON is refused in place; the draft stays as it was.
  await dialog.getByRole("button", { name: "Import JSON" }).click();
  await dialog.getByLabel("Theme JSON to import").fill("{ \"version\": 1,");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "not valid JSON" })).toBeVisible();

  // A theme that fails only contrast loads with suggestions, and saves once they are applied.
  const faint = JSON.parse(exported.text) as { light: Record<string, unknown> };
  faint.light.mutedForeground = "#d4d4d4";
  await dialog.getByLabel("Theme JSON to import").fill(JSON.stringify(faint));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Theme imported, but some text is hard to read." })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Download JSON" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Apply suggestions" }).click();
  await expect(dialog.getByRole("button", { name: "Apply suggestions" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Create preset" }).click();
  await expect(dialog).toHaveCount(0);
  const stored = (await teamPresetTheme(team.id, name)) as { light: { mutedForeground: string } } | null;
  expect(stored?.light.mutedForeground).toMatch(/^oklch\(/);
});

test("should show an artifact's custom theme as Custom, copy it, and let only owners and admins save it as a team preset", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const userId = await signIn(page);
  const team = await newTeam(userId);
  const publicId = await createTestArtifact({ userId, title: "Agent themed plan", content: "# Notes\n\nShip it.", visibility: "private", theme: oceanTheme() });
  seeded.publicIds.push(publicId);
  await shareTestArtifact(publicId, team.id, "team");
  const name = `Saved ${testInfo.project.name}`;

  await page.goto(`/artifact/${publicId}`);
  await page.getByRole("button", { name: "Theme: Custom. Change theme" }).click();
  await expect(page.getByRole("radio", { name: "Custom: this artifact's own theme" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("note").filter({ hasText: "has its own theme" })).toBeVisible();
  await page.getByRole("button", { name: "Copy theme JSON" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { version: number; fonts: unknown };
  expect(copied).toMatchObject({ version: 1, fonts: expect.any(Object) });

  await page.getByRole("button", { name: "Save as team preset" }).click();
  const dialog = page.getByRole("dialog", { name: /^Save as a Theme team .+ preset$/ });
  await expect(dialog.getByRole("combobox", { name: "Start from" })).toHaveCount(0);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create preset" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Saved as a Theme team .+ preset\./)).toBeVisible();
  expect(await teamPresetRefs(team.id, name)).toHaveLength(1);

  // The artifact keeps its own theme, and the new preset is on offer.
  await page.reload();
  await page.getByRole("button", { name: "Theme: Custom. Change theme" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${name}:`) })).toBeVisible();

  // A plain member can copy the theme but not save presets.
  await setTeamRole(team.id, userId, "member");
  await page.reload();
  await page.getByRole("button", { name: "Theme: Custom. Change theme" }).click();
  await expect(page.getByRole("button", { name: "Copy theme JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as team preset" })).toHaveCount(0);
});

test("should resize a phone photo to an icon of at most 512 px under 1 MB before it uploads", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "One browser run is enough for the resize; the picker is the same on phones.");
  await signIn(page);
  const publicId = await createTestArtifact({ userId: await devUserId(), title: "Icon photo e2e", content: "# Trip", visibility: "private", theme: null });
  seeded.publicIds.push(publicId);
  await page.goto(`/artifact/${publicId}`);

  const photo = await largePhoto(page);
  expect(photo.byteLength).toBeGreaterThan(1_048_576);
  await page.getByRole("button", { name: "Add icon" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByText("Any photo or image works.")).toBeVisible();

  // The upload ticket is the first thing the browser asks the server for, with the prepared file's name, type, and size.
  const ticket = page.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes("contentType"));
  await page.locator('input[type="file"]').setInputFiles({ name: "IMG_4032.JPG", mimeType: "image/jpeg", buffer: photo });
  const sent = await ticket;
  // Let the server answer (locally it has no file storage, so the upload stops there) before the page closes.
  await sent.response();
  const body = JSON.parse(sent.postData() ?? "[]") as [{ filename: string; contentType: string; size: number }];
  expect(body[0]).toMatchObject({ filename: "IMG_4032.jpg", contentType: "image/jpeg" });
  expect(body[0].size).toBeGreaterThan(0);
  // A 512 × 384 JPEG is a few dozen KB; far under the 1 MB cap.
  expect(body[0].size).toBeLessThanOrEqual(200_000);
});
