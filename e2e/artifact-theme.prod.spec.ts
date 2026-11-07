import { expect, test, type Page } from "@playwright/test";

import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason } from "./support/local-db";

/**
 * Artifact pages load theme fonts only for the theme they use: an unthemed
 * artifact requests no theme font file, and a Classic one only Roboto and
 * JetBrains Mono. Runs against the production build with artifacts seeded
 * in a local throwaway database (see support/local-db.ts); skipped otherwise.
 */

const themeFontPath = /\/fonts\/v1\/([a-z0-9-]+)\//;
const content = "# Plan\n\nShip it.\n\n```ts\nexport const ready = true;\n```";

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const seeded = { publicIds: [] as string[], userIds: [] as string[], plain: "", classic: "" };

test.beforeAll(async () => {
  const userId = await createTestUser();
  seeded.userIds.push(userId);
  seeded.plain = await createTestArtifact({ userId, title: "Plain plan", content, visibility: "public", theme: null });
  seeded.classic = await createTestArtifact({ userId, title: "Classic plan", content, visibility: "public", theme: "classic" });
  seeded.publicIds.push(seeded.plain, seeded.classic);
});

test.afterAll(async () => {
  await cleanUp(seeded.publicIds, seeded.userIds);
});

async function themeFacesOn(page: Page, publicId: string): Promise<string[]> {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (themeFontPath.test(request.url())) urls.push(request.url());
  });
  await page.goto(`/artifact/${publicId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return [...new Set(urls.flatMap((url) => themeFontPath.exec(url)?.[1] ?? []))].sort();
}

test("should request no theme font files when the artifact has no theme", async ({ page }) => {
  expect(await themeFacesOn(page, seeded.plain)).toEqual([]);
  await expect(page.locator("[data-artifact-theme]")).toHaveAttribute("data-artifact-theme", "default");
});

test("should request only the theme's own fonts and render in them when the artifact uses Classic", async ({ page }) => {
  expect(await themeFacesOn(page, seeded.classic)).toEqual(["jetbrains-mono", "roboto"]);
  const scope = page.locator("[data-artifact-theme]");
  await expect(scope).toHaveAttribute("data-artifact-theme", "classic");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /^Roboto/);
  await expect(scope.locator("[data-code-block] pre").first()).toHaveCSS("font-family", /^"JetBrains Mono"/);
});
