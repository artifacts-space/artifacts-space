import { expect, test } from "./support/test";

import { localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * The Connections page against a real database and a real sign-in: the
 * "Connect a client" card offers the four desktop apps, and every link and
 * command names this site's own endpoint. Needs dev sign-in and a local
 * throwaway database; skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

test("should offer the four desktop apps with this site's endpoint when a signed-in person opens Connections", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  // A new dev user is asked for a username first; this gives it one.
  await readyDevUser();
  await page.goto("/app/connections");

  const card = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Connect a client" }) });
  const apps = card.getByRole("list", { name: "Add to a desktop app" });
  await expect(apps.getByRole("listitem")).toHaveText(["Add to Cursor", "Add to Claude Desktop (opens in a new tab)", "Add to Codex (opens in a new tab)", "Add to Grok Bot (opens in a new tab)"]);
  await expect(apps.locator("svg[data-client-logo]")).toHaveCount(4);
  await expect(card.getByText("Codex and Grok Bot have no install link yet, so their buttons open the steps in the docs.", { exact: false })).toBeVisible();

  // The page builds every link from the server's own origin (siteOrigin(): BETTER_AUTH_URL first),
  // which need not be Playwright's baseURL. So take the endpoint from Claude's link, check that it is
  // this server's MCP path, and check that every other link and command names the same endpoint.
  const claude = new URL((await apps.locator("a[data-install=claude-desktop]").getAttribute("href")) ?? "");
  const endpoint = claude.searchParams.get("connectorUrl") ?? "";
  const parsed = new URL(endpoint);
  expect(["http:", "https:"]).toContain(parsed.protocol);
  expect(parsed.pathname + parsed.search + parsed.hash).toBe("/api/mcp");
  expect(parsed.href).toBe(endpoint);
  const cursor = new URL((await apps.locator("a[data-install=cursor]").getAttribute("href")) ?? "");
  expect(JSON.parse(atob(cursor.searchParams.get("config") ?? ""))).toEqual({ url: endpoint });

  // The command for Claude Code and the mcp.json for other clients stay on the card, under the apps.
  await expect(card.locator('[data-variant="command"]').filter({ hasText: `claude mcp add --transport http artifacts ${endpoint}` })).toBeVisible();
  await expect(card.getByRole("link", { name: "Steps for every client" })).toHaveAttribute("href", "/docs/clients");

  // Codex and Grok Bot have no install link: their buttons open the app's steps in the docs, in a new tab.
  for (const [app, anchor] of [["codex", "codex"], ["grok-bot", "grok-bot"]] as const) {
    const link = apps.locator(`a[data-install=${app}]`);
    await expect(link).toHaveAttribute("href", `/docs/clients#${anchor}`);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways page scroll").toBeLessThanOrEqual(0);
});
