import { expect, test } from "@playwright/test";

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
 * theme face. Runs against the production build with rows seeded in a
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
  const scope = page.locator("[data-artifact-theme]");
  await expect(scope).toHaveAttribute("data-artifact-theme", seeded.ref);
  await expect(scope).toHaveAttribute("data-theme-source", "team");
  await expect(heading).toHaveCSS("font-family", /^Inter/);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect([...new Set(urls.flatMap((url) => themeFontPath.exec(url)?.[1] ?? []))]).toEqual(["inter"]);
});

test("should name the team default on the Markdown version's Theme line", async ({ request }) => {
  const response = await request.get(`/artifact/${seeded.publicId}.md`);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("- Theme: Inter brand (team default)");
});
