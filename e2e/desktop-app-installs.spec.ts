import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The "Add to" buttons for the desktop apps, on the component gallery (no
 * database). Every button is a link. Cursor and Claude Desktop go to the
 * app's own install link; Codex and Grok Bot have none, so they open their
 * steps on the clients page of the docs in a new tab.
 */

const endpoint = "https://artifacts.space/api/mcp";

const row = (page: Page) => page.locator('[data-specimen="add to a desktop app"]').getByRole("list", { name: "Add to a desktop app" });

async function openGallery(page: Page) {
  await page.goto("/dev/components");
  await expect(row(page)).toBeVisible();
  await row(page).scrollIntoViewIfNeeded();
}

test("should show the four apps in order, each with its mark, when the row renders", async ({ page }) => {
  await openGallery(page);
  const items = row(page).getByRole("listitem");
  await expect(items).toHaveText(["Add to Cursor", "Add to Claude Desktop (opens in a new tab)", "Add to Codex (opens in a new tab)", "Add to Grok Bot (opens in a new tab)"]);
  for (const item of await items.all()) {
    await expect(item.locator("svg[data-client-logo]")).toHaveCount(1);
    await expect(item.locator("svg[data-client-logo]")).toBeVisible();
  }
  // Every button is one height, so the row reads as one set of controls.
  const heights = await items.evaluateAll((elements) => elements.map((element) => Math.round((element.firstElementChild ?? element).getBoundingClientRect().height)));
  expect(new Set(heights).size, `button heights ${heights.join(", ")}`).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways page scroll").toBeLessThanOrEqual(0);
});

test("should link Cursor and Claude Desktop to their install links when the app has one", async ({ page }) => {
  await openGallery(page);
  const cursor = row(page).locator("a[data-install=cursor]");
  await expect(cursor).toHaveAttribute("href", /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=artifacts&config=/);

  const claude = row(page).locator("a[data-install=claude-desktop]");
  const href = new URL((await claude.getAttribute("href")) ?? "");
  expect(href.origin + href.pathname).toBe("https://claude.ai/customize/connectors");
  expect(href.searchParams.get("modal")).toBe("add-custom-connector");
  expect(href.searchParams.get("connectorName")).toBe("artifacts.space");
  expect(href.searchParams.get("connectorUrl")).toBe(endpoint);
  await expect(claude).toHaveAttribute("target", "_blank");
  await expect(claude).toHaveAttribute("rel", "noopener noreferrer");
});

test("should open the Codex steps in the docs in a new tab when Add to Codex is pressed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openGallery(page);
  const button = row(page).locator("a[data-install=codex]");
  await expect(button).toHaveAttribute("href", "/docs/clients#codex");
  await expect(button).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const [docs] = await Promise.all([context.waitForEvent("page"), button.click()]);
  await docs.waitForLoadState("domcontentloaded");
  expect(new URL(docs.url()).pathname + new URL(docs.url()).hash).toBe("/docs/clients#codex");
  // The gallery stays where it was: the steps open beside it, not in its place.
  expect(new URL(page.url()).pathname).toBe("/dev/components");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const section = docs.locator("section[aria-labelledby=codex]");
  await expect(section.getByRole("heading", { level: 2 })).toBeInViewport();
  for (const label of ["Plugins", "Add custom MCP server", "Server URL", "Create as a plugin"]) {
    await expect(section.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(section.locator('[data-variant="command"]').filter({ hasText: `codex mcp add artifacts --url ${endpoint}` })).toBeVisible();

  // The URL the form takes is one press away from the clipboard.
  await section.getByRole("button", { name: `Copy ${endpoint}` }).click();
  expect(await docs.evaluate(() => navigator.clipboard.readText())).toBe(endpoint);
});

test("should open the Grok Bot steps in the docs in a new tab when Add to Grok Bot is pressed", async ({ page, context }) => {
  await openGallery(page);
  const button = row(page).locator("a[data-install=grok-bot]");
  await expect(button).toHaveAttribute("href", "/docs/clients#grok-bot");

  const [docs] = await Promise.all([context.waitForEvent("page"), button.click()]);
  await docs.waitForLoadState("domcontentloaded");
  expect(new URL(docs.url()).pathname + new URL(docs.url()).hash).toBe("/docs/clients#grok-bot");

  const section = docs.locator("section[aria-labelledby=grok-bot]");
  await expect(section.getByRole("heading", { level: 2 })).toBeInViewport();
  for (const label of ["Connect Apps", "Add a custom connector", "Remote HTTPS", "Add plugin"]) {
    await expect(section.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(section.getByRole("button", { name: `Copy ${endpoint}` })).toBeVisible();
  await expect(section.locator("figure[data-code-block]").filter({ hasText: `Add the MCP server at ${endpoint} and name it artifacts.space.` })).toBeVisible();
});
