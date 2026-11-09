import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { themePresets } from "../src/lib/themes/presets";
import { presetTheme } from "../src/lib/themes/resolve";

import {
  cleanUp,
  createTestArtifact,
  createTestTeam,
  deleteTestTeams,
  devUserId,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  presetRevisionCount,
  readyDevUser,
  seedPresetRevisions,
  setTeamRole,
  shareTestArtifact,
  createTestTeamPreset,
  teamDefaultOf,
  teamPresetRefs,
  teamPresetTheme,
  versionCount,
} from "./support/local-db";
import { largePhoto } from "./support/photos";

/**
 * Theme polish, end to end, on a phone and a desktop: a team admin exports a
 * preset as JSON and imports it back unchanged, a faint import is fixed with
 * Apply suggestions, and an artifact's custom theme (as an agent would set
 * it) shows as Custom in the picker, copies as JSON, and saves as a team
 * preset for owners and admins only. A phone photo picked as an icon is
 * resized in the browser before it uploads. Team theme history restores an
 * earlier preset or team default as a new revision, within the cap. Needs dev sign-in and a local
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

function presetJson(id: string) {
  const preset = themePresets.find((item) => item.id === id);
  if (!preset) throw new Error(`The ${id} preset is missing.`);
  return preset.theme;
}

const oceanTheme = () => presetJson("ocean");

test("should round-trip a preset through Download JSON and Import JSON, and fix a faint import with one click", async ({ page }, testInfo) => {
  const userId = await signIn(page);
  const team = await newTeam(userId);
  const project = testInfo.project.name;

  await page.goto(`/teams/${team.slug}?tab=themes`);
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

test("should keep every preset and team default change, restore an earlier one as a new revision, and cap the history", async ({ page }, testInfo) => {
  const userId = await signIn(page);
  const team = await newTeam(userId);
  const name = `History ${testInfo.project.name}`;
  const ref = await createTestTeamPreset(team.id, name, oceanTheme());
  // 54 old Paper revisions, then a newer one that fails today's contrast rules.
  await seedPresetRevisions(team.id, ref, presetJson("paper"), 54);
  await seedPresetRevisions(team.id, ref, { ...oceanTheme(), light: { ...oceanTheme().light, mutedForeground: "#d4d4d4" } }, 1, 100);
  const publicId = await createTestArtifact({ userId, title: "Uses the preset", content: "# Notes", visibility: "private", theme: ref });
  seeded.publicIds.push(publicId);
  await shareTestArtifact(publicId, team.id, "team");

  // A save adds a revision; the oldest past 50 are pruned.
  await page.goto(`/teams/${team.slug}?tab=themes`);
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  let dialog = page.getByRole("dialog", { name: `Edit ${name}` });
  await dialog.getByLabel("Description").fill("Our look");
  await dialog.getByRole("button", { name: "Save preset" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await presetRevisionCount(ref)).toBe(50);

  await page.getByRole("button", { name: `Edit ${name}` }).click();
  dialog = page.getByRole("dialog", { name: `Edit ${name}` });
  await dialog.getByRole("button", { name: "History" }).click();
  const history = dialog.getByRole("list", { name: "History" });
  await expect(history.getByRole("listitem")).toHaveCount(50);
  await expect(history.getByRole("listitem").first()).toContainText("Current");

  // The faint revision is not restored as is: it opens in the editor with suggestions.
  await history.getByRole("button", { name: /^Restore previous:/ }).click();
  await expect(page.getByText(/fails today's checks/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply suggestions" })).toBeVisible();
  expect(await presetRevisionCount(ref)).toBe(50);

  // An older Paper revision restores as a new revision; the old ones stay.
  await history.getByRole("button", { name: /^Restore:/ }).first().click();
  await expect(page.getByText("Restored. Artifacts that use this preset show it now.")).toBeVisible();
  expect(await teamPresetTheme(team.id, name)).toEqual(presetTheme("paper"));
  await expect(history.getByRole("listitem")).toHaveCount(50);
  expect(await presetRevisionCount(ref)).toBe(50);
  // Team themes never file artifact versions.
  expect(await versionCount(publicId)).toBe(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // The team default keeps its history too, and Restore previous brings the last one back.
  await page.getByRole("combobox", { name: "Team default" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByText("Team default saved.")).toBeVisible();
  await page.getByRole("combobox", { name: "Team default" }).click();
  await page.getByRole("option", { name: "Paper", exact: true }).click();
  await expect(page.getByText("Team default saved.").first()).toBeVisible();
  await expect.poll(async () => (await teamDefaultOf(team.id)).theme).toBe("paper");
  await page.getByRole("button", { name: "Team default history" }).click();
  await page.getByRole("list", { name: "Team default history" }).getByRole("button", { name: /^Restore previous:/ }).click();
  await expect(page.getByText("Team default restored.")).toBeVisible();
  expect((await teamDefaultOf(team.id)).theme).toBe(ref);
  expect(await versionCount(publicId)).toBe(0);

  // Plain members do not see the history.
  await setTeamRole(team.id, userId, "member");
  await page.reload();
  await expect(page.getByRole("button", { name: "Team default history" })).toHaveCount(0);
});
