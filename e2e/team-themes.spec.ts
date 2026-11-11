import { expect, test, type Page } from "@playwright/test";

import {
  cleanUp,
  createTestArtifact,
  createTestTeam,
  deleteTestTeams,
  readyDevUser,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  setTeamRole,
  shareTestArtifact,
  storedThemes,
  teamDefaultOf,
  teamPresetRefs,
  versionCount,
} from "./support/local-db";

/**
 * Team presets and the team default, end to end: an admin builds a preset
 * with the live preview (fixing low contrast with one click), makes it the
 * team default, and an unthemed team artifact renders with it; a plain
 * member sees it in the artifact picker and can use it, but cannot manage
 * presets; deleting a preset in use says so and the artifact falls back.
 * Needs dev sign-in and a local throwaway database; skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const seeded = { publicIds: [] as string[], teamIds: [] as string[], teamId: "", slug: "", publicId: "", ref: "", name: "" };

test.afterAll(async () => {
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, []);
});

async function pickOption(page: Page, trigger: ReturnType<Page["getByRole"]>, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("should let an admin build a preset with a live preview and make it the team default", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The editor flow runs once, on the desktop viewport.");
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  const team = await createTestTeam(userId, "owner");
  Object.assign(seeded, { teamId: team.id, slug: team.slug, name: `Brand ${team.id.slice(0, 4)}` });
  seeded.teamIds.push(team.id);
  seeded.publicId = await createTestArtifact({ userId, title: "Team plan", content: "# Notes\n\nShip it.", visibility: "private", theme: null });
  seeded.publicIds.push(seeded.publicId);
  await shareTestArtifact(seeded.publicId, team.id, "team");

  await page.goto(`/teams/${team.slug}?tab=themes`);
  await page.getByRole("button", { name: "New preset" }).click();
  const dialog = page.getByRole("dialog", { name: "New team preset" });
  await dialog.getByLabel("Name").fill(seeded.name);
  await pickOption(page, dialog.getByRole("combobox", { name: "Start from" }), "Ocean");
  await pickOption(page, dialog.getByRole("combobox", { name: "Heading font" }), "Inter");
  await pickOption(page, dialog.getByRole("combobox", { name: "Body font" }), "Inter");
  const preview = dialog.locator("[data-preset-preview-scope]");
  await expect(preview.getByRole("heading", { level: 1, name: "Launch plan" })).toHaveCSS("font-family", /^Inter/);

  // Too-faint secondary text is refused, with the passing color suggested and applied in one click.
  await dialog.locator("#preset-light-mutedForeground").fill("#d4d4d4");
  await expect(dialog.getByText(/light\.mutedForeground on light\.card is .*WCAG AA/).first()).toBeVisible();
  await expect(dialog.locator('[data-contrast-suggestion="light.mutedForeground"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Apply suggestions" }).click();
  await expect(dialog.getByRole("button", { name: "Apply suggestions" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Create preset" }).click();
  await expect(dialog).toHaveCount(0);
  const [ref] = await teamPresetRefs(team.id, seeded.name);
  expect(ref).toMatch(/^team:brand-[a-z0-9]+-[a-z0-9]{6}$/);
  seeded.ref = ref ?? "";
  await expect(page.locator(`[data-team-preset="${seeded.ref}"]`)).toBeVisible();

  await pickOption(page, page.getByRole("combobox", { name: "Team default" }), seeded.name);
  await expect(page.getByText("Team default saved.")).toBeVisible();
  expect(await teamDefaultOf(team.id)).toEqual({ theme: seeded.ref, setBy: userId });
  // Team settings never file artifact versions.
  expect(await versionCount(seeded.publicId)).toBe(0);

  await page.goto(`/artifact/${seeded.publicId}`);
  const scope = page.locator("[data-artifact-theme]");
  await expect(scope).toHaveAttribute("data-artifact-theme", seeded.ref);
  await expect(scope).toHaveAttribute("data-theme-source", "team");
  await expect(page.getByRole("heading", { level: 1, name: "Team plan" })).toHaveCSS("font-family", /^Inter/);
  // The team sees its preset's name on the Markdown version; readers outside it see "Custom" (team-theme-fonts.prod.spec.ts).
  const markdown = await page.request.get(`/artifact/${seeded.publicId}.md`);
  expect(await markdown.text()).toContain(`- Theme: ${seeded.name} (team default)`);
  await page.getByRole("button", { name: "Choose a theme" }).click();
  await expect(page.getByRole("radio", { name: /^Team default: / })).toHaveAttribute("aria-checked", "true");
});

test("should show a plain member the team preset in the picker but not the controls to manage it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || seeded.ref === "", "Runs after the admin flow, on the desktop viewport.");
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  await setTeamRole(seeded.teamId, userId, "member");

  await page.goto(`/teams/${seeded.slug}?tab=themes`);
  await expect(page.locator(`[data-team-preset="${seeded.ref}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "New preset" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${seeded.name}` })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Team default" })).toBeDisabled();

  await page.goto(`/artifact/${seeded.publicId}`);
  await page.getByRole("button", { name: "Choose a theme" }).click();
  await page.getByRole("radio", { name: new RegExp(`^${seeded.name}:`) }).click();
  await expect(page.getByRole("button", { name: `Theme: ${seeded.name}. Change theme` })).toBeVisible();
  await expect(page.locator("[data-artifact-theme]")).toHaveAttribute("data-theme-source", "artifact");
  const stored = await storedThemes(seeded.publicId);
  expect(stored.artifact).toBe(seeded.ref);
  expect(stored.versions[0]).toBe(seeded.ref);

  // A new artifact starts private, and its picker offers the presets of the member's teams.
  const fresh = await createTestArtifact({ userId, title: "New private artifact", content: "# Notes", visibility: "private", theme: null });
  seeded.publicIds.push(fresh);
  await page.goto(`/artifact/${fresh}`);
  await page.getByRole("button", { name: "Choose a theme" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${seeded.name}:`) })).toBeVisible();
});

test("should say how many artifacts use a preset before deleting it, then fall back cleanly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || seeded.ref === "", "Runs after the member flow, on the desktop viewport.");
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  await setTeamRole(seeded.teamId, await readyDevUser(), "admin");

  await page.goto(`/teams/${seeded.slug}?tab=themes`);
  await page.getByRole("button", { name: `Delete ${seeded.name}` }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${seeded.name}?` });
  await expect(confirm).toContainText("Used by 1 artifact.");
  await expect(confirm).toContainText("It is the team default");
  await expect(confirm.getByRole("checkbox", { name: "Don't ask again" })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete preset" }).click();
  await expect(page.locator(`[data-team-preset="${seeded.ref}"]`)).toHaveCount(0);
  expect((await teamDefaultOf(seeded.teamId)).theme).toBeNull();

  await page.goto(`/artifact/${seeded.publicId}`);
  await expect(page.locator("[data-artifact-theme]")).toHaveAttribute("data-theme-source", "site");
});
