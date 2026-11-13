import { expect, type Page, test } from "@playwright/test";

const endpoint = "https://artifacts.space/api/mcp";
const clients = ["Claude Code", "Cursor", "Claude Desktop and claude.ai", "ChatGPT", "Codex", "Grok Bot", "OpenCode", "Devin", "Kimi Code CLI", "fx", "Other clients"];

/** A section heading's accessible name: its title, then the hidden "Link to this section". */
function headingName(title: string): RegExp {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*Link to this section$`);
}

/** True when the page itself scrolls sideways; code blocks scroll in their own boxes. */
async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

/** Clients shown with their label alone (by the owner's choice), with a spacer that keeps the labels aligned. */
const withoutMark = new Set(["Devin"]);

test("should show every client with its mark when the clients page opens", async ({ page }) => {
  await page.goto("/docs/clients");

  for (const name of clients) {
    const heading = page.getByRole("heading", { level: 2, name: headingName(name) });
    await expect(heading).toBeVisible();
    await expect(heading.locator("svg[data-client-logo]")).toHaveCount(withoutMark.has(name) ? 0 : 1);
    if (withoutMark.has(name)) await expect(heading.locator("[data-client-logo-spacer]")).toHaveCount(1);
  }
  await expect(page.getByText("Product names and logos belong to their owners.")).toBeVisible();
  expect(await pageScrollsSideways(page)).toBe(false);
});

test("should give the OpenCode and Kimi Code CLI steps when the clients page opens", async ({ page }) => {
  await page.goto("/docs/clients");

  await expect(page.locator('[data-variant="command"]').filter({ hasText: `opencode mcp add artifacts --url ${endpoint}` })).toBeVisible();
  await expect(page.locator('[data-variant="command"]').filter({ hasText: "opencode mcp auth artifacts" })).toBeVisible();
  await expect(page.locator("figure[data-code-block]").filter({ hasText: "/mcp-config login artifacts" })).toBeVisible();
});

test("should show the new clients' steps when their quickstart tab is chosen", async ({ page }) => {
  await page.goto("/docs/quickstart");

  const opencodeTab = page.getByRole("tab", { name: "OpenCode" });
  await expect(opencodeTab.locator("svg[data-client-logo]")).toHaveCount(1);
  await opencodeTab.click();
  await expect(page.getByRole("tabpanel").locator('[data-variant="command"]').filter({ hasText: `opencode mcp add artifacts --url ${endpoint}` })).toBeVisible();

  await page.getByRole("tab", { name: "Kimi Code CLI" }).click();
  await expect(page.getByRole("tabpanel").locator("figure[data-code-block]").filter({ hasText: "/mcp-config login artifacts" })).toBeVisible();
  expect(await pageScrollsSideways(page)).toBe(false);
});

test("should give the fx steps when its section and quickstart tab open", async ({ page }) => {
  await page.goto("/docs/clients");

  await expect(page.locator('[data-variant="command"]').filter({ hasText: "curl -fsSL https://fx.sh/setup.sh | bash" })).toBeVisible();
  await expect(page.locator('[data-variant="command"]').filter({ hasText: `fx mcp add artifacts ${endpoint}` })).toBeVisible();
  await expect(page.locator("figure[data-code-block]").filter({ hasText: "/skills install artifacts-space/skills" })).toBeVisible();
  await expect(page.locator('[data-variant="command"]').filter({ hasText: "fx mcp show artifacts" })).toBeVisible();

  await page.goto("/docs/quickstart");
  const fxTab = page.getByRole("tab", { name: "fx", exact: true });
  await expect(fxTab.locator("svg[data-client-logo]")).toHaveCount(1);
  await fxTab.click();
  await expect(page.getByRole("tabpanel").locator('[data-variant="command"]').filter({ hasText: `fx mcp add artifacts ${endpoint}` })).toBeVisible();
  expect(await pageScrollsSideways(page)).toBe(false);
});

test("should give the ChatGPT steps when its section and quickstart tab open", async ({ page }) => {
  await page.goto("/docs/clients");

  const section = page.locator("section", { has: page.getByRole("heading", { level: 2, name: headingName("ChatGPT") }) });
  await expect(section.getByRole("link", { name: "Plugins" })).toHaveAttribute("href", "https://chatgpt.com/plugins");
  await expect(section.getByText("Add custom MCP server")).toBeVisible();
  await expect(section.getByRole("button", { name: `Copy ${endpoint}` })).toBeVisible();

  await page.goto("/docs/quickstart");
  const chatgptTab = page.getByRole("tab", { name: "ChatGPT", exact: true });
  await expect(chatgptTab.locator("svg[data-client-logo]")).toHaveCount(1);
  await chatgptTab.click();
  await expect(page.getByRole("tabpanel").getByText("Leave the client ID and secret empty", { exact: false })).toBeVisible();
  expect(await pageScrollsSideways(page)).toBe(false);
});

test("should copy the server URL without moving the text when it is chosen in a client's steps", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/clients");

  // Every guide that names the URL in its steps shows it as a copy button.
  for (const id of ["claude-desktop", "chatgpt", "codex", "grok-bot", "devin", "other-clients"]) {
    const section = page.locator(`section[aria-labelledby=${id}]`);
    await expect(section.getByRole("button", { name: `Copy ${endpoint}` }), id).toHaveCount(1);
  }

  const copy = page.locator("section[aria-labelledby=codex]").getByRole("button", { name: `Copy ${endpoint}` });
  await copy.scrollIntoViewIfNeeded();
  const before = await copy.boundingBox();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(endpoint);
  // The mark turns into a check, and the text around the button does not move.
  await expect(copy.locator("svg.tabler-icon-check")).toBeVisible();
  expect(await copy.boundingBox()).toEqual(before);
  await expect(copy).toHaveText(endpoint);
  expect(await pageScrollsSideways(page)).toBe(false);
});
