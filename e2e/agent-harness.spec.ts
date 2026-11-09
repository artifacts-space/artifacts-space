import { expect, test, type Page } from "@playwright/test";

import {
  artifactHarnessOverride,
  cleanUp,
  connectionOverride,
  createTestArtifact,
  deleteOAuthClients,
  localDatabaseEnabled,
  readyDevUser,
  seedConnectedApp,
  setArtifactHarness,
} from "./support/local-db";

/**
 * The agent harness an artifact was made with ("via Claude Code" and its
 * icon), and changing it. The first checks need no database: the gallery's
 * Connections specimen and /dev/workspace, where Note 3 was made with Claude
 * Code. The rest seed a local throwaway Postgres (E2E_LOCAL_DB=1) and skip
 * without one.
 */

test("should show each app's detected agent and change it from the select on the Connections page", async ({ page }) => {
  await page.goto("/dev/components#harnesses");
  const fixture = page.locator('[data-harness-fixture="connections"]');
  const claude = fixture.locator('[data-connected-app="Claude Code"]');
  const select = claude.getByRole("combobox", { name: "Agent for Claude Code" });
  await expect(select).toHaveText(/Claude Code \(detected\)/);
  await expect(claude.locator('[data-harness-icon="claude-code"]').first()).toBeVisible();

  await select.click();
  await page.getByRole("option", { name: "Codex" }).click();
  await expect(select).toHaveText(/^Codex\b(?! \()/);
  await expect(page.getByText("Saves from Claude Code now show Codex.")).toBeVisible();

  // An unknown client is "Other agent", with the name it gave shown to its owner as plain text.
  const unknown = fixture.locator('[data-connected-app="Night shift"]');
  await expect(unknown.getByRole("combobox", { name: "Agent for Night shift" })).toHaveText(/Other agent \(detected\)/);
  await expect(unknown.getByText("Calls itself “zed-mcp”")).toBeVisible();

  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: document.documentElement.clientWidth }));
  expect(width.scroll, "no horizontal page scroll").toBeLessThanOrEqual(width.inner + 1);
});

test("should mark a card with its agent's icon and say via the agent in the /app byline", async ({ page }) => {
  await page.goto("/dev/workspace");
  const list = page.locator("[data-slot=artifact-list]");
  await expect(list.getByRole("img", { name: "Made with Claude Code" })).toHaveCount(1);
  await expect(list.getByRole("button", { name: /^Note 3\b/ }).getByRole("img", { name: "Made with Claude Code" })).toBeVisible();

  await page.goto("/dev/workspace?artifact=fixtureworkspacenote02");
  const editor = page.getByRole("region", { name: "Edit Note 3" });
  const byline = editor.locator('[data-harness="claude-code"]');
  await expect(byline).toHaveText("via Claude Code");
  await expect(byline.locator('[data-harness-icon="claude-code"]')).toBeVisible();

  await page.goto("/dev/workspace?artifact=fixtureworkspacenote03");
  await expect(page.getByRole("region", { name: "Edit Note 4" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Edit Note 4" }).locator("[data-harness]")).toHaveCount(0);
});

test.describe("with a database", () => {
  test.skip(!localDatabaseEnabled(), "Set E2E_LOCAL_DB=1 and DATABASE_URL to a local throwaway Postgres with every migration applied.");
  test.skip(({ isMobile }) => isMobile, "checked on desktop");

  const artifacts: string[] = [];
  const clients: string[] = [];

  test.afterAll(async () => {
    await deleteOAuthClients(clients);
    await cleanUp(artifacts, []);
  });

  async function signIn(page: Page) {
    await page.goto("/api/dev/sign-in");
    await page.waitForURL(/\/app/);
    return readyDevUser();
  }

  test("should show via the agent with its icon on the artifact page and let an editor change it without a version", async ({ page }) => {
    const userId = await signIn(page);
    const publicId = await createTestArtifact({ userId, title: "Harness e2e", content: "# Made by an agent", visibility: "public", theme: null });
    artifacts.push(publicId);
    await setArtifactHarness(publicId, "codex");

    await page.goto(`/artifact/${publicId}`);
    const byline = page.locator("main").locator('[data-harness="codex"]');
    await expect(byline).toHaveText("via Codex");
    await expect(byline.locator('[data-harness-icon="codex"]')).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Made with" }).click();
    await page.getByRole("menuitemradio", { name: "Cursor" }).click();
    await expect(page.locator("main").locator('[data-harness="cursor"]')).toHaveText("via Cursor");
    expect(await artifactHarnessOverride(publicId)).toBe("cursor");

    // Signed out, a reader of the public page sees the same harness.
    await page.context().clearCookies();
    await page.goto(`/artifact/${publicId}`);
    await expect(page.locator("main").locator('[data-harness="cursor"]')).toHaveText("via Cursor");
  });

  test("should save the agent chosen for a connected app on the Connections page", async ({ page }) => {
    const userId = await signIn(page);
    const clientId = await seedConnectedApp(userId, "Harness e2e app", "codex-mcp-client");
    clients.push(clientId);

    await page.goto("/app/connections");
    const select = page.getByRole("combobox", { name: "Agent for Harness e2e app" });
    await expect(select).toHaveText(/Codex \(detected\)/);
    await select.click();
    await page.getByRole("option", { name: "OpenCode" }).click();
    await expect(page.getByText("Saves from Harness e2e app now show OpenCode.")).toBeVisible();
    await expect.poll(() => connectionOverride(userId, clientId)).toBe("opencode");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Agent for Harness e2e app" })).toHaveText(/^OpenCode\b(?! \()/);
  });
});
