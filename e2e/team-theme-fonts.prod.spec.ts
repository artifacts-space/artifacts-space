import { expect, test } from "./support/test";

import { themePresets } from "../src/lib/themes/presets";

import {
  cleanUp,
  createTestArtifact,
  createTestTeam,
  createTestTeamPreset,
  createTestUser,
  deleteTestTeams,
  localDatabaseEnabled,
  localDatabaseSkipReason,
  setTestTeamDefault,
  shareTestArtifact,
} from "./support/local-db";

/**
 * A public artifact in a team whose default is a team preset set in Inter
 * renders with it for a signed-out reader, and loads only Inter: no other
 * theme face, and never sees the preset's name or id (they stay with the
 * team). Runs against the production build with rows seeded in a
 * local throwaway database (support/local-db.ts); skipped otherwise.
 */

const themeFontPath = /\/fonts\/v1\/([a-z0-9-]+)\//;

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const seeded = { publicIds: [] as string[], userIds: [] as string[], teamIds: [] as string[], publicId: "", ref: "" };

test.beforeAll(async () => {
  const base = themePresets.find((preset) => preset.id === "default");
  if (!base) throw new Error("The default preset is missing.");
  const userId = await createTestUser();
  seeded.userIds.push(userId);
  const team = await createTestTeam(userId, "owner");
  seeded.teamIds.push(team.id);
  seeded.ref = await createTestTeamPreset(team.id, "Inter brand", { ...base.theme, fonts: { body: "inter", heading: "inter", mono: "geist-mono" } });
  await setTestTeamDefault(team.id, seeded.ref);
  seeded.publicId = await createTestArtifact({ userId, title: "Inter plan", content: "# Notes\n\nShip it.\n\n```ts\nexport const ready = true;\n```", visibility: "private", theme: null });
  seeded.publicIds.push(seeded.publicId);
  await shareTestArtifact(seeded.publicId, team.id, "public");
});

test.afterAll(async () => {
  await deleteTestTeams(seeded.teamIds);
  await cleanUp(seeded.publicIds, seeded.userIds);
});

test("should render the team default and request only Inter when an unthemed team artifact inherits an Inter preset", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (themeFontPath.test(request.url())) urls.push(request.url());
  });
  await page.goto(`/artifact/${seeded.publicId}`);
  const heading = page.getByRole("heading", { level: 1, name: "Inter plan" });
  await expect(heading).toBeVisible();
  // A signed-out reader is outside the team: the preset's id (with its team-chosen slug) never reaches the page.
  const scope = page.locator("[data-artifact-theme]");
  await expect(scope).toHaveAttribute("data-artifact-theme", "custom");
  await expect(scope).toHaveAttribute("data-theme-source", "team");
  const html = await page.content();
  expect(html).not.toContain(seeded.ref);
  expect(html).not.toContain("Inter brand");
  await expect(heading).toHaveCSS("font-family", /^Inter/);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect([...new Set(urls.flatMap((url) => themeFontPath.exec(url)?.[1] ?? []))]).toEqual(["inter"]);
});

test("should keep the team preset's name off the Markdown version for a signed-out reader", async ({ request }) => {
  const response = await request.get(`/artifact/${seeded.publicId}.md`);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).toContain("- Theme: Custom");
  expect(text).not.toContain("Inter brand");
  expect(text).not.toContain("team default");
  expect(text).not.toContain(seeded.ref);
});
